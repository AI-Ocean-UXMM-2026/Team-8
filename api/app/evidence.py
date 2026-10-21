"""Private evidence only. Reservation is distinct from a successfully stored object."""
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from .core.user_access import CurrentIdentity

router = APIRouter(prefix='/api/evidence', tags=['evidence'])
BUCKET = 'parcelcare-evidence'
MAX_BYTES = 10 * 1024 * 1024
SIGNATURES = {'image/jpeg': b'\xff\xd8\xff', 'image/png': b'\x89PNG\r\n\x1a\n', 'application/pdf': b'%PDF-'}


class EvidenceReservation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    shipment_id: UUID
    mime_type: str
    size_bytes: int = Field(strict=True, ge=1, le=MAX_BYTES)
    sme_visible: bool = True


@router.post('/reservations', status_code=201)
def reserve(body: EvidenceReservation, actor: CurrentIdentity):
    if body.mime_type not in SIGNATURES:
        raise HTTPException(422, 'Only JPEG, PNG and PDF evidence is allowed')
    return actor.database.rpc('register_evidence', {
        'p_shipment': str(body.shipment_id), 'p_mime': body.mime_type,
        'p_size': body.size_bytes, 'p_sme_visible': body.sme_visible,
    })


def evidence(actor, evidence_id):
    rows = actor.database.rows('evidence', select='id,object_path,uploaded_by,mime_type,size_bytes',
                               id=f'eq.{evidence_id}')
    if not rows:
        raise HTTPException(404, 'Evidence unavailable')
    return rows[0]


@router.put('/{evidence_id}/content', status_code=204)
async def upload(evidence_id: UUID, request: Request, actor: CurrentIdentity):
    record = await run_in_threadpool(evidence, actor, evidence_id)
    if record['uploaded_by'] != actor.user_id:
        raise HTTPException(403, 'Only the reserving user can upload')
    mime = request.headers.get('content-type', '').split(';')[0].strip().lower()
    if mime != record['mime_type']:
        raise HTTPException(422, 'Content type differs from reservation')
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > min(MAX_BYTES, record['size_bytes']):
            raise HTTPException(413, 'Evidence exceeds reserved size')
        content.extend(chunk)
    if len(content) != record['size_bytes'] or not content.startswith(SIGNATURES[mime]):
        raise HTTPException(422, 'Evidence size or file signature is invalid')
    await run_in_threadpool(actor.database.call, 'POST',
                            f'/storage/v1/object/{BUCKET}/{quote(record["object_path"], safe="/")}',
                            content=bytes(content), headers={'Content-Type': mime, 'x-upsert': 'false'})
    return Response(status_code=204)


@router.post('/{evidence_id}/download')
def download(evidence_id: UUID, actor: CurrentIdentity, response: Response):
    record = evidence(actor, evidence_id)
    # Storage independently rechecks RLS and existence when creating the signed URL.
    result = actor.database.call('POST', f'/storage/v1/object/sign/{BUCKET}/{quote(record["object_path"], safe="/")}',
                                 json={'expiresIn': 60})
    signed = result.get('signedURL', '')
    if not signed.startswith('/object/sign/'):
        raise HTTPException(503, 'Invalid storage response')
    response.headers['Cache-Control'] = 'no-store'
    return {'url': str(actor.database.http.base_url).rstrip('/') + '/storage/v1' + signed,
            'expires_in': 60}
