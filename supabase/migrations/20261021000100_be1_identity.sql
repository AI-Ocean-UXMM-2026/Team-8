begin;

-- Not an exposed PostgREST schema. Helpers run with fixed search_path.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 200),
  created_at timestamptz not null default now()
);
create table public.smes (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  name text not null check (length(trim(name)) between 1 and 200),
  contact_email text,
  created_at timestamptz not null default now(),
  unique (id, warehouse_id)
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  warehouse_id uuid not null references public.warehouses(id),
  sme_id uuid,
  role text not null check (role in ('owner','staff','sme','rider')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'sme' and sme_id is not null) or (role <> 'sme' and sme_id is null)),
  foreign key (sme_id, warehouse_id) references public.smes(id, warehouse_id),
  unique nulls not distinct (profile_id, warehouse_id, sme_id, role)
);
create index memberships_actor_idx on public.memberships(profile_id, warehouse_id) where active;

create function private.is_staff(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.profile_id = (select auth.uid())
    and m.warehouse_id = w and m.active and m.role in ('owner','staff'));
$$;
create function private.is_sme(w uuid, s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.profile_id = (select auth.uid())
    and m.warehouse_id = w and m.sme_id = s and m.active and m.role = 'sme');
$$;
create function private.can_read_tenant(w uuid, s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff(w) or private.is_sme(w,s);
$$;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
commit;
