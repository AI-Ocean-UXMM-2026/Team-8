import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.providers import create_user_client
from app.core.settings import Settings


class ProviderInitializationTests(unittest.TestCase):
    def test_real_sdk_initializes_isolated_sync_clients_without_network(self):
        settings = Settings(_env_file=None, supabase_url='https://fixture.supabase.co',
                            SUPABASE_PUBLIC_KEY='sb_publishable_fixture')
        first = create_user_client('first-user-token', settings)
        second = create_user_client('second-user-token', settings)
        self.assertEqual(first.options.headers['Authorization'], 'Bearer first-user-token')
        self.assertEqual(second.options.headers['Authorization'], 'Bearer second-user-token')
        self.assertIsNot(first.options.storage, second.options.storage)
        self.assertFalse(first.options.persist_session)
        self.assertFalse(first.options.auto_refresh_token)
