"""Bounded private evidence bytes; paths never come from model output."""
import base64
from urllib.parse import quote
import httpx

SIGNATURES = {'image/jpeg': b'\xff\xd8\xff', 'image/png': b'\x89PNG\r\n\x1a\n', 'application/pdf': b'%PDF-'}


class EvidenceUnavailable(ValueError):
    pass


class EvidenceReader:
    def __init__(self, settings):
        self.base = settings.supabase_url.rstrip('/')
        self.key = settings.supabase_worker_key

    def read(self, snapshot):
        content, consumed, total = [], [], 0
        descriptors = snapshot.get('evidence_files', [])
        for item in descriptors[:3]:
            mime, size, path = item['mime_type'], item['size_bytes'], item['object_path']
            if mime not in SIGNATURES or not isinstance(size, int) or not 0 < size <= 10*1024*1024 or total+size > 20*1024*1024:
                raise EvidenceUnavailable('Evidence limit exceeded')
            if not path or '..' in path.split('/') or path.startswith('/'):
                raise EvidenceUnavailable('Invalid evidence path')
            url = self.base + '/storage/v1/object/parcelcare-evidence/' + quote(path, safe='/')
            data = bytearray()
            with httpx.stream('GET', url, headers={'Authorization': 'Bearer '+self.key, 'apikey': self.key}, timeout=15, follow_redirects=False) as response:
                response.raise_for_status()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > size:
                        raise EvidenceUnavailable('Evidence size mismatch')
            if len(data) != size or not data.startswith(SIGNATURES[mime]):
                raise EvidenceUnavailable('Evidence signature mismatch')
            encoded = 'data:'+mime+';base64,'+base64.b64encode(data).decode()
            content.append({'type': 'input_text', 'text': 'Untrusted evidence UUID: '+item['id']})
            if mime == 'application/pdf':
                content.append({'type': 'input_file', 'filename': item['id']+'.pdf', 'file_data': encoded})
            else:
                content.append({'type': 'input_image', 'image_url': encoded, 'detail': 'auto'})
            consumed.append(item['id']); total += size
        return content, consumed, len(descriptors) > len(consumed)
