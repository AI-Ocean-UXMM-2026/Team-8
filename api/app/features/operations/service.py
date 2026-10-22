"""Authorize warehouse scope and invoke the user JWT database client."""
from uuid import UUID
from ...core.errors import AppError


def scope(identity, warehouse_id):
    if warehouse_id is None:
        warehouses = {m.warehouse_id for m in identity.memberships if m.role in ('owner', 'staff')}
        if len(warehouses) != 1:
            raise AppError(403, 'FORBIDDEN', 'Choose an authorized warehouse.')
        warehouse_id = next(iter(warehouses))
    identity.require_staff(warehouse_id)
    return str(warehouse_id)


def call(request, identity, function, parameters):
    factory = request.app.state.database_factory
    if factory is None:
        raise AppError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured.')
    try:
        return factory.for_user(identity).rpc(function, parameters)
    except AppError:
        raise
    except Exception as exc:
        code, message = str(getattr(exc, 'code', '')), str(getattr(exc, 'message', ''))
        if code == '42501':
            raise AppError(403, 'FORBIDDEN', 'Operation is not authorized.') from exc
        if message == 'review_flags':
            raise AppError(422, 'REVIEW_FLAGS', 'Acknowledge missing or uncertain attributes before verifying.') from exc
        if message in ('stale_version', 'idempotency_conflict', 'stock_unavailable'):
            raise AppError(409, message.upper(), 'Refresh the record or retry the original command.') from exc
        if message == 'closure_pending':
            raise AppError(409, 'CLOSURE_PENDING', 'Required decisions, verified outcomes or actions are still pending.') from exc
        if code in ('22023', '22P02', '23505', '23503', '23514', '22003'):
            raise AppError(422, 'VALIDATION_ERROR', 'Operation violates warehouse rules.') from exc
        raise AppError(503, 'SERVICE_UNAVAILABLE', 'Database operation could not be confirmed; retry with the same key.') from exc


def read(request, identity, warehouse_id, kind, **filters):
    return call(request, identity, 'ops_read', {'p_warehouse': scope(identity, warehouse_id),
        'p_kind': kind, 'p_filters': {k: str(v) if isinstance(v, UUID) else v for k,v in filters.items() if v is not None}})


def command(request, identity, warehouse_id, kind, key, body, entity=None):
    return call(request, identity, 'ops_command', {'p_warehouse': scope(identity, warehouse_id),
        'p_kind': kind, 'p_key': str(key), 'p_entity': str(entity) if entity else None,
        'p_body': body.model_dump(mode='json'), 'p_correlation': str(request.state.correlation_id)})
