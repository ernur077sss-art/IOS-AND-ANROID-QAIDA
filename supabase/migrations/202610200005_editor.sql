create table private.source_checks(id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.listings(id),source_url text not null,checked_at timestamptz not null default now(),checked_by uuid not null references public.profiles(id),verified_fields text[] not null);
revoke all on private.source_checks from public,anon,authenticated;
create function private.save_catalog(p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare lid uuid:=nullif(p_values->>'id','')::uuid;verified boolean:=coalesce(p_values->>'verified','')='on';fields text[]:=array['title','city','summary'];begin
 if not private.admin() then raise exception 'FORBIDDEN';end if;
 if p_values->>'source_url' !~ '^https://[^/@]+(/|$)' or p_values->>'source_url' is null then raise exception 'INVALID_INPUT';end if;
 if nullif(p_values->>'address','') is not null then fields:=fields||'address'::text;end if;
 if lid is not null and exists(select 1 from public.listings where id=lid and origin='user' and created_by=auth.uid()) then raise exception 'FORBIDDEN';end if;
 if lid is null then lid:=gen_random_uuid();end if;
 insert into public.listings(id,title,city,category,summary,address,source_url,checked_at,origin,publication_status,out_of_city,verified_fields)
 values(lid,p_values->>'title',p_values->>'city',p_values->>'category',p_values->>'summary',nullif(p_values->>'address',''),p_values->>'source_url',case when verified then now() end,case when verified then 'real_verified' else 'editorial' end,case when p_values->>'publication_status'='published' then 'published' else 'draft' end,coalesce(p_values->>'out_of_city','')='on',case when verified then fields else '{}'::text[] end)
 on conflict(id) do update set title=excluded.title,city=excluded.city,category=excluded.category,summary=excluded.summary,address=excluded.address,source_url=excluded.source_url,checked_at=excluded.checked_at,origin=excluded.origin,publication_status=excluded.publication_status,out_of_city=excluded.out_of_city,verified_fields=excluded.verified_fields;
 if verified then insert into private.source_checks(listing_id,source_url,checked_by,verified_fields) values(lid,p_values->>'source_url',auth.uid(),fields);end if;
 insert into private.audit_log(actor,action,entity) values(auth.uid(),'save_catalog',lid);return lid;end$$;
create function public.save_catalog(p_values jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_catalog(p_values)$$;
revoke all on function public.save_catalog(jsonb),private.save_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.save_catalog(jsonb),private.save_catalog(jsonb) to authenticated;
create function private.message_page(p_plan uuid,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan);result jsonb;begin
 if (p_before is null)<>(p_before_id is null) then raise exception 'INVALID_INPUT';end if;
 with page as(select id,group_id,author_id,body,created_at from public.room_messages where group_id=p.group_id and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 51),visible as(select * from page order by created_at desc,id desc limit 50)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v) order by created_at,id) from visible v),'[]'),'has_more',(select count(*)>50 from page)) into result;
 return result;end$$;
create function public.message_page(p_plan uuid,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.message_page(p_plan,p_before,p_before_id)$$;
revoke all on function public.message_page(uuid,timestamptz,uuid),private.message_page(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.message_page(uuid,timestamptz,uuid),private.message_page(uuid,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
