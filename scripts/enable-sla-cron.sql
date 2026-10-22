-- Run in the Supabase SQL Editor after the SLA migration.
create extension if not exists pg_cron;
select cron.schedule('parcelcare-sla-escalations','* * * * *','select public.run_sla_escalations();');
select jobid,jobname,schedule,active from cron.job where jobname='parcelcare-sla-escalations';
