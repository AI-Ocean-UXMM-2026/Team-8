"""Run with python -m app.worker from api/. Uses a separate trusted credential."""
import argparse
import time
from supabase import create_client
from .core.settings import get_settings
from .features.ai.evidence import EvidenceReader
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
    parser.add_argument('--maintenance-only', action='store_true')
    args = parser.parse_args()
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_worker_key:
        raise SystemExit('Configure SUPABASE_URL and server-only SUPABASE_WORKER_KEY')
    database = WorkerDatabase(create_client(settings.supabase_url, settings.supabase_worker_key))
    if not args.maintenance_only and (not settings.openai_api_key or not settings.openai_model or not settings.openai_checker_model):
        raise SystemExit('Configure OPENAI_API_KEY, OPENAI_MODEL and OPENAI_CHECKER_MODEL, or use --maintenance-only')
    provider = None if args.maintenance_only else OpenAIInvestigator(settings)
    checker = None if args.maintenance_only else OpenAIChecker(settings)
    evidence_reader = EvidenceReader(settings)
    maintenance_at = 0.0
    while True:
        # Never print SDK exceptions: they can include request data or credentials.
        failed = False
        try:
            if time.monotonic() >= maintenance_at:
                database.rpc('run_sla_escalations', {})
                database.rpc('run_retention', {'p_hours': settings.location_retention_hours})
                maintenance_at = time.monotonic() + settings.maintenance_interval_seconds
            if provider is not None:
                for job in database.rpc('analysis_pending', {}):
                    try:
                        run_job(database, provider, job, checker, evidence_reader)
                    except Exception:
                        failed = True
                        print('Worker job could not finish; lease recovery will retry.', flush=True)
        except Exception:
            failed = True
            print('Worker cycle unavailable; retrying without exposing provider details.', flush=True)
        if args.once:
            if failed:
                raise SystemExit(1)
            return
        time.sleep(5)


if __name__ == '__main__':
    main()
