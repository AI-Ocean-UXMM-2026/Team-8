"""Run with python -m app.worker from api/. Uses a separate trusted credential."""
import argparse
import time
from supabase import create_client
from .core.settings import get_settings
from .features.ai.service import OpenAIInvestigator, run_job


class WorkerDatabase:
    ALLOWED = {'analysis_pending', 'analysis_claim', 'analysis_finish'}

    def __init__(self, client):
        self.client = client

    def rpc(self, function, parameters):
        if function not in self.ALLOWED:
            raise ValueError('Unregistered worker function')
        return self.client.rpc(function, parameters).execute().data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_worker_key:
        raise SystemExit('Configure SUPABASE_URL and server-only SUPABASE_WORKER_KEY')
    database = WorkerDatabase(create_client(settings.supabase_url, settings.supabase_worker_key))
    provider = OpenAIInvestigator(settings)
    while True:
        # No raw coordinates, tokens, complaint text or provider errors are logged.
        for job in database.rpc('analysis_pending', {}):
            run_job(database, provider, job)
        if args.once:
            return
        time.sleep(5)


if __name__ == '__main__':
    main()
