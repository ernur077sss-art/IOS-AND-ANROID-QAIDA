-- Additional plans in an existing company use the same authorization and idempotency rules.
drop function public.create_plan(uuid,text,timestamptz,text,uuid);
create function public.create_plan(p_listing uuid,p_title text,p_starts timestamptz,p_meeting text,p_request uuid,p_group uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();g uuid;pid uuid;op private.operations;payload jsonb:=jsonb_build_object('listing',p_listing,'title',p_title,'starts',p_starts,'meeting',p_meeting,'group',p_group);begin
 perform pg_advisory_xact_lock(hashtext(u::text||p_request::text));
 select * into op from private.operations where user_id=u and request_id=p_request;
 if found then if op.payload<>payload then raise exception 'VERSION_CONFLICT';end if;return op.result_id;end if;
 perform private.limit_action('create_plan',10);
 if p_starts<=now() or p_starts>now()+interval '2 years' or p_request is null then raise exception 'INVALID_INPUT';end if;
 if not exists(select 1 from public.listings where id=p_listing and publication_status='published') then raise exception 'NOT_FOUND';end if;
 if p_group is null then
 insert into public.groups(owner_id,title) values(u,p_title) returning id into g;
 insert into public.group_members values(g,u,'active');
 else
 select id into g from public.groups where id=p_group and owner_id=u for update;
 if g is null or not private.member(g) then raise exception 'FORBIDDEN';end if;
 end if;
 insert into public.plans(group_id,listing_id,title,starts_at,meeting_note) values(g,p_listing,trim(p_title),p_starts,trim(p_meeting)) returning id into pid;
 insert into public.plan_versions select pid,1,to_jsonb(p) from public.plans p where id=pid;
 insert into private.operations values(u,p_request,payload,pid);return pid;
end$$;
revoke all on function public.create_plan(uuid,text,timestamptz,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_plan(uuid,text,timestamptz,text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
create or replace function public.submit_listing(p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();lid uuid:=(p_values->>'id')::uuid;new_status text:=case when p_values->>'action'='draft' then 'draft' else 'pending_review' end;begin
 perform private.limit_action('submission',5);
 if new_status='pending_review' and coalesce(p_values->>'rights','') not in ('true','on') then raise exception 'INVALID_INPUT';end if;
 if new_status='pending_review' and p_values->>'kind'='event' and ((p_values->>'event_starts') is null or (p_values->>'event_starts')::timestamptz<=now()) then raise exception 'INVALID_INPUT';end if;
 if lid is null then
 insert into public.listings(title,city,category,summary,address,origin,publication_status,created_by,kind,event_starts) values(p_values->>'title',p_values->>'city',p_values->>'category',p_values->>'summary',p_values->>'address','user',new_status,u,coalesce(p_values->>'kind','place'),(p_values->>'event_starts')::timestamptz) returning id into lid;
 else
 perform 1 from public.listings where id=lid and created_by=u and publication_status in ('draft','rejected','published') for update;
 if not found then raise exception 'FORBIDDEN';end if;
 update public.listings set title=p_values->>'title',city=p_values->>'city',category=p_values->>'category',summary=p_values->>'summary',address=p_values->>'address',kind=coalesce(p_values->>'kind','place'),event_starts=(p_values->>'event_starts')::timestamptz,publication_status=new_status,rejection_reason=null where id=lid;
 end if;return lid;end$$;
