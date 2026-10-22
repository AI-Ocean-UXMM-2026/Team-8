"""Run with python -m app.worker from api/. Uses a separate trusted credential."""
import argparse
import time
from supabase import create_client
from .core.settings import get_settings
from .features.ai.service import OpenAIInvestigator, OpenAIChecker, run_job


class WorkerDatabase:
    ALLOWED = {'analysis_pending', 'analysis_claim', 'analysis_stage', 'analysis_finish', 'run_retention', 'run_sla_escalations'}

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
    provider = OpenAIInvestigator(settings) if settings.openai_api_key and settings.openai_model else None
    checker = OpenAIChecker(settings) if settings.openai_api_key and settings.openai_checker_model else None
    maintenance_at = 0.0
    while True:
        # No raw coordinates, tokens, complaint text or provider errors are logged.
        if time.monotonic() >= maintenance_at:
            database.rpc('run_sla_escalations', {})
            database.rpc('run_retention', {'p_hours': settings.location_retention_hours})
            maintenance_at = time.monotonic() + settings.maintenance_interval_seconds
        for job in database.rpc('analysis_pending', {}):
            run_job(database, provider, job, checker)
        if args.once:
            return
        time.sleep(5)


if __name__ == '__main__':
    main()
