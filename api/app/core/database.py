"""User-scoped RPC seam. No service-role client is available through this API."""
from typing import Callable, Protocol
from .auth import AuthContext


class UserDatabase(Protocol):
    def rpc(self, function: str, parameters: dict) -> object: ...


class UserDatabaseFactory(Protocol):
    def for_user(self, identity: AuthContext) -> UserDatabase: ...


class SupabaseUserDatabase:
    def __init__(self, client):
        self._client = client

    def rpc(self, function: str, parameters: dict) -> object:
        # Call only reviewed atomic commands; no arbitrary SQL or general table writes.
        if function not in {'sme_stock_catalog', 'shipments_queue_read', 'warehouse_catalog_page', 'warehouse_catalog', 'sme_delivery_profile', 'sme_order_command', 'sme_orders_read', 'order_customer', 'delivery_destination', 'receive_shipment', 'decide_approval', 'register_evidence',
                            'mark_notification_read', 'start_tracking', 'record_location',
                            'rider_report', 'case_queue_read', 'case_risk_command', 'tracking_settings', 'shipment_arrival',
                            'sla_policies_read', 'sla_policy_write', 'sla_cases_read', 'sla_response', 'product_category_read', 'product_category_write', 'product_category_retry', 'route_plan_read', 'route_plan_write', 'get_live_location', 'stop_tracking', 'ops_read', 'ops_command',
                            'case_read', 'case_command', 'tenant_feed', 'delivery_read',
                            'delivery_command', 'evidence_access', 'evidence_upload_access', 'mark_notification_unread', 'review_case'}:
            raise ValueError('Unregistered database command')
        return self._client.rpc(function, parameters).execute().data


class SupabaseUserDatabaseFactory:
    def __init__(self, create_user_client: Callable[[str], object]):
        self._create_user_client = create_user_client

    def for_user(self, identity: AuthContext) -> UserDatabase:
        return SupabaseUserDatabase(self._create_user_client(identity.access_token))
