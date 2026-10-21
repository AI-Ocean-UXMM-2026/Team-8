begin;
create function public.can_receive_tracking_topic(p_topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_topic is null or p_topic !~ '^tracking:[0-9a-fA-F-]{36}$' then return false; end if;
 return private.can_read_tracking(substring(p_topic from 10)::uuid);
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.can_receive_tracking_topic(text) from public,anon;
grant execute on function public.can_receive_tracking_topic(text) to authenticated;

-- Plain PostgreSQL has no hosted Realtime schema. Install native policies when
-- Supabase provides it; tests use explicit stand-ins, never a claimed hosted run.
do $$ begin
 if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
  execute 'create policy parcelcare_tracking_receive on realtime.messages for select to authenticated using (extension=''broadcast'' and public.can_receive_tracking_topic((select realtime.topic())))';
  execute 'create policy parcelcare_tracking_scope on realtime.messages as restrictive for select to authenticated using ((select realtime.topic()) not like ''tracking:%'' or (extension=''broadcast'' and public.can_receive_tracking_topic((select realtime.topic()))))';
  execute 'create policy parcelcare_tracking_no_client_send on realtime.messages as restrictive for insert to authenticated with check ((select realtime.topic()) not like ''tracking:%'')';
 end if;
end $$;
create function private.broadcast_location_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  -- Coordinate-free invalidation. Every client must reauthorize through /live,
  -- even if Realtime cached an earlier successful channel join.
  execute 'select realtime.send($1,$2,$3,true)' using jsonb_build_object('session_id',new.session_id),'location','tracking:'||new.session_id::text;
 end if;
 return new;
end $$;
create trigger tracking_location_broadcast after insert on public.rider_locations for each row execute function private.broadcast_location_change();
revoke all on function private.broadcast_location_change() from public,anon,authenticated;
commit;
