begin;
create function public.warehouse_catalog_page(p_warehouse uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n integer:=coalesce((p_filters->>'limit')::integer,12); token jsonb; result jsonb; selected jsonb; total integer; categories jsonb;
 filters jsonb:=jsonb_build_object('search',coalesce(p_filters->>'search',''),'category',coalesce(p_filters->>'category',''),'in_stock_only',coalesce((p_filters->>'in_stock_only')::boolean,true));
begin
 if not(private.is_staff(p_warehouse) or exists(select 1 from public.memberships where profile_id=auth.uid() and warehouse_id=p_warehouse and role='sme' and active)) then raise exception 'forbidden' using errcode='42501'; end if;
 if n not between 1 and 48 or length(filters->>'search')>200 or jsonb_array_length(coalesce(p_filters->'selected_ids','[]'))>100 then raise exception 'invalid_filters' using errcode='22023'; end if;
 if p_filters->>'cursor' is not null then
  token=(p_filters->>'cursor')::jsonb;
  if token->'filters' is distinct from filters or token->>'warehouse' is distinct from p_warehouse::text or token->>'name' is null or token->>'id' is null then raise exception 'invalid_cursor' using errcode='22023'; end if;
 end if;
 with catalog as materialized (
  select p.id,p.warehouse_id,p.sku,p.name,p.available_qty-p.reserved_qty as available_qty,
   case when c.status='verified' then c.category else 'uncategorized' end as category
  from public.products p left join public.product_categorizations c on c.product_id=p.id
  where p.warehouse_id=p_warehouse and p.sme_id is null
 ), filtered as materialized (
  select * from catalog where (not(filters->>'in_stock_only')::boolean or available_qty>0)
   and (filters->>'category'='' or category=filters->>'category')
   and position(lower(filters->>'search') in lower(name||' '||sku))>0
 ), page as (
  select * from filtered where token is null or (name,id)>(token->>'name',(token->>'id')::uuid)
  order by name,id limit n+1
 )
 select (select coalesce(jsonb_agg(to_jsonb(p) order by p.name,p.id),'[]') from page p),
  (select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.id),'[]') from catalog c where c.id::text in(select jsonb_array_elements_text(coalesce(p_filters->'selected_ids','[]')))),
  (select count(*)::integer from filtered),
  (select coalesce(jsonb_agg(x.category order by x.category),'[]') from(select distinct category from catalog) x)
 into result,selected,total,categories;
 return jsonb_build_object('items',case when jsonb_array_length(result)>n then result-n else result end,'selected_items',selected,'total',total,'categories',categories,
  'next_cursor',case when jsonb_array_length(result)>n then jsonb_build_object('warehouse',p_warehouse,'filters',filters,'name',result->(n-1)->>'name','id',result->(n-1)->>'id')::text else null end);
end $$;
revoke all on function public.warehouse_catalog_page(uuid,jsonb) from public,anon;
grant execute on function public.warehouse_catalog_page(uuid,jsonb) to authenticated;
commit;
