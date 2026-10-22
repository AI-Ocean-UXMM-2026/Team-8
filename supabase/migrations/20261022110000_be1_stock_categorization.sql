begin;

-- Independent from stock quantities and their optimistic version counter.
create table public.product_categorizations (
 product_id uuid primary key references public.products(id),
 metadata jsonb not null default '{}',
 suggestion jsonb,
 category text check(category in ('food_beverages','clothing_accessories','home_kitchen','electronics','beauty_personal_care','health_medical','office_stationery','other')),
 status text not null default 'pending' check(status in ('pending','verified')),
 revision integer not null default 0 check(revision>=0),
 review_note text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 updated_at timestamptz not null default now(),
 check(status<>'verified' or (category is not null and reviewed_by is not null and reviewed_at is not null and length(btrim(review_note))>=5))
);
alter table public.product_categorizations enable row level security;
create policy category_staff_read on public.product_categorizations for select to authenticated using (
 exists(select 1 from public.products p where p.id=product_id and private.is_staff(p.warehouse_id)));
revoke all on public.product_categorizations from anon,authenticated;
grant select on public.product_categorizations to authenticated;

-- Append-only command snapshots retain metadata, model suggestion and human decisions.
create table private.product_category_commands (
 warehouse_id uuid not null, actor_id uuid not null references public.profiles(id),
 key uuid not null, product_id uuid not null references public.products(id),
 kind text not null, body jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(warehouse_id,actor_id,key)
);
revoke all on private.product_category_commands from public,anon,authenticated;

create function public.product_category_read(p_warehouse uuid,p_product uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.products; c public.product_categorizations;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into p from public.products where id=p_product and warehouse_id=p_warehouse;
 if p.id is null then return null; end if;
 select * into c from public.product_categorizations where product_id=p_product;
 return jsonb_build_object('product_id',p.id,'warehouse_id',p.warehouse_id,'sme_id',p.sme_id,
 'name',p.name,'sku',p.sku,'revision',coalesce(c.revision,0),'metadata',
 jsonb_build_object('description','','material','','intended_use','','storage_notes','')||coalesce(c.metadata,'{}'),
 'suggestion',c.suggestion,'category',c.category,'status',coalesce(c.status,'pending'),
 'review_note',c.review_note,'reviewed_by',c.reviewed_by,'reviewed_at',c.reviewed_at,'updated_at',c.updated_at);
end $$;

create function public.product_category_retry(p_warehouse uuid,p_product uuid,p_key uuid,p_revision integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare old private.product_category_commands;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into old from private.product_category_commands where warehouse_id=p_warehouse and actor_id=auth.uid() and key=p_key;
 if old.key is null then return null; end if;
 if old.product_id<>p_product or old.kind<>'analyze' or (old.body->>'expected_revision')::integer<>p_revision
 then raise exception 'idempotency_conflict' using errcode='22023'; end if;
 return old.result;
end $$;

create function public.product_category_write(p_warehouse uuid,p_product uuid,p_kind text,p_key uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.product_categorizations; old private.product_category_commands;
 result jsonb; meta jsonb; flags boolean; k text; value text;
begin
 if not private.is_staff(p_warehouse) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_key is null or p_kind not in ('metadata','analyze','review') or p_kind is null
 or jsonb_typeof(p_body) is distinct from 'object'
 or jsonb_typeof(p_body->'expected_revision') is distinct from 'number'
 or (p_body->>'expected_revision')::numeric<0
 or (p_body->>'expected_revision')::numeric<>trunc((p_body->>'expected_revision')::numeric) then raise exception 'invalid_command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_warehouse::text||auth.uid()::text||p_key::text,0));
 select * into old from private.product_category_commands where warehouse_id=p_warehouse and actor_id=auth.uid() and key=p_key;
 if old.key is not null then
  if old.product_id<>p_product or old.kind<>p_kind or
   (case when p_kind='analyze' then old.body->'expected_revision'<>p_body->'expected_revision' else old.body<>p_body end)
  then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if not exists(select 1 from public.products where id=p_product and warehouse_id=p_warehouse)
 then raise exception 'forbidden' using errcode='42501'; end if;
 insert into public.product_categorizations(product_id) values(p_product) on conflict do nothing;
 select * into c from public.product_categorizations where product_id=p_product for update;
 if p_body->>'expected_revision' is null or c.revision<>(p_body->>'expected_revision')::integer
 then raise exception 'stale_version' using errcode='40001'; end if;
 if p_kind='metadata' then
  meta=p_body-'expected_revision';
  if meta - array['description','material','intended_use','storage_notes'] <> '{}'::jsonb
  then raise exception 'invalid_metadata' using errcode='22023'; end if;
  foreach k in array array['description','material','intended_use','storage_notes'] loop
   if jsonb_typeof(meta->k) is distinct from 'string' then raise exception 'invalid_metadata' using errcode='22023'; end if;
   value=btrim(meta->>k);
   if length(value)>(case k when 'description' then 2000 when 'material' then 300 else 500 end)
   then raise exception 'invalid_metadata' using errcode='22023'; end if;
   meta=jsonb_set(meta,array[k],to_jsonb(value));
  end loop;
  update public.product_categorizations set metadata=meta,suggestion=null,category=null,status='pending',
   reviewed_by=null,reviewed_at=null,review_note=null where product_id=p_product;
 elsif p_kind='analyze' then
  -- Suggestions remain provisional; only the staff review command can verify them.
  if p_body->'suggestion'->>'category' not in ('food_beverages','clothing_accessories','home_kitchen','electronics','beauty_personal_care','health_medical','office_stationery','other')
   or p_body->'suggestion'->>'category' is null
   or jsonb_typeof(p_body->'suggestion'->'confidence') is distinct from 'number'
   or (p_body->'suggestion'->>'confidence')::numeric not between 0 and 1
   or jsonb_typeof(p_body->'suggestion'->'uncertain_attributes') is distinct from 'array'
   or length(btrim(p_body->'suggestion'->>'rationale')) not between 1 and 1500
   or p_body->'suggestion'->>'rationale' is null
  then raise exception 'invalid_suggestion' using errcode='22023'; end if;
  update public.product_categorizations set suggestion=(p_body->'suggestion')||jsonb_build_object('requires_review',true),
   category=null,status='pending',reviewed_by=null,reviewed_at=null,review_note=null where product_id=p_product;
 else
  if p_body->>'category' is null or p_body->>'category' not in ('food_beverages','clothing_accessories','home_kitchen','electronics','beauty_personal_care','health_medical','office_stationery','other')
   or coalesce(length(btrim(p_body->>'note')),0) not between 5 and 1000
  then raise exception 'invalid_review' using errcode='22023'; end if;
  flags=c.suggestion is null or coalesce((c.suggestion->>'confidence')::numeric,0)<0.8
   or c.suggestion->>'category'='other' or jsonb_array_length(coalesce(c.suggestion->'uncertain_attributes','[]'))>0;
  foreach k in array array['description','material','intended_use','storage_notes'] loop
   if nullif(btrim(c.metadata->>k),'') is null then flags=true; end if;
  end loop;
  if flags and not coalesce((p_body->>'acknowledge_flags')::boolean,false)
  then raise exception 'review_flags' using errcode='22023'; end if;
  update public.product_categorizations set category=p_body->>'category',status='verified',review_note=btrim(p_body->>'note'),
   reviewed_by=auth.uid(),reviewed_at=now() where product_id=p_product;
 end if;
 update public.product_categorizations set revision=revision+1,updated_at=now() where product_id=p_product;
 result=public.product_category_read(p_warehouse,p_product);
 insert into private.product_category_commands(warehouse_id,actor_id,key,product_id,kind,body,result)
 values(p_warehouse,auth.uid(),p_key,p_product,p_kind,p_body,result);
 return result;
end $$;
revoke all on function public.product_category_read(uuid,uuid),public.product_category_retry(uuid,uuid,uuid,integer),public.product_category_write(uuid,uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.product_category_read(uuid,uuid),public.product_category_retry(uuid,uuid,uuid,integer),public.product_category_write(uuid,uuid,text,uuid,jsonb) to authenticated;
commit;
