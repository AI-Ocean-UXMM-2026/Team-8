-- PGlite-only stand-ins for the Supabase-managed schemas. Never run this file
-- against Supabase: it is not a migration and cannot test GoTrue/Storage APIs.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema storage;
-- Test-only Realtime boundary: native service behavior is a separate gate.
create schema realtime;
create table realtime.messages(id uuid primary key default gen_random_uuid(),topic text,extension text,payload jsonb);
alter table realtime.messages enable row level security;
grant usage on schema realtime to authenticated;
grant select,insert on realtime.messages to authenticated;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true); $$;
create function realtime.send(payload jsonb,event text,topic text,is_private boolean) returns void language sql as $$
 insert into realtime.messages(topic,extension,payload) values(topic,'broadcast',jsonb_build_object('event',event,'payload',payload,'private',is_private));
$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
