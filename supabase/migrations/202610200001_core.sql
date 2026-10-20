-- Qayda mobile MVP. All state changes go through explicit RPCs.
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create table public.profiles(id uuid primary key references auth.users(id), display_name text not null default 'Участник' check(char_length(display_name) between 1 and 80));
create table public.listings(
 id uuid primary key default gen_random_uuid(), title text not null check(char_length(title) between 3 and 160),
 city text not null check(city in ('semey','almaty')), category text not null check(category in ('Наследие','Этнотуры','Музеи','Природа','Театры','Прогулки')),
 summary text not null check(char_length(summary) between 10 and 4000), address text,
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 source_url text check(source_url is null or source_url ~ '^https://[^/@]+'), checked_at timestamptz,
 origin text not null check(origin in ('demo_fixture','editorial','real_verified','user')),
 price_minor bigint check(price_minor between 0 and 999999999999), image_url text,
 publication_status text not null default 'draft' check(publication_status in ('draft','pending_review','published','rejected','suspended')),
 created_by uuid references public.profiles(id), rejection_reason text, created_at timestamptz not null default now(),
 check((latitude is null)=(longitude is null)),
 check(origin <> 'real_verified' or (source_url is not null and checked_at is not null))
);
create table public.saved_listings(user_id uuid not null references public.profiles(id), listing_id uuid not null references public.listings(id), primary key(user_id,listing_id));
create table public.groups(id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), title text not null);
create table public.group_members(group_id uuid not null references public.groups(id), user_id uuid not null references public.profiles(id), status text not null default 'active' check(status in ('active','left','removed')), primary key(group_id,user_id));
create table public.plans(id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id), listing_id uuid references public.listings(id), title text not null check(char_length(title) between 3 and 160), starts_at timestamptz not null, meeting_note text not null check(char_length(meeting_note) between 3 and 500), status text not null default 'draft' check(status in ('draft','proposed','confirmed','cancelled','completed')), version integer not null default 1 check(version>0), created_at timestamptz not null default now());
create table public.plan_versions(plan_id uuid not null references public.plans(id), version integer not null, snapshot jsonb not null, primary key(plan_id,version));
create table public.plan_rsvps(plan_id uuid not null references public.plans(id), user_id uuid not null references public.profiles(id), answer text not null check(answer in ('going','maybe','not_going')), acknowledged_version integer not null, primary key(plan_id,user_id));
create table public.room_messages(id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id), author_id uuid not null references public.profiles(id), body text not null check(char_length(body) between 1 and 2000), request_id uuid not null, created_at timestamptz not null default now(), unique(author_id,request_id));
create table public.budget_items(id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.plans(id), title text not null check(char_length(title) between 1 and 100), amount_minor bigint not null check(amount_minor between 0 and 999999999999), cost_kind text not null check(cost_kind in ('shared','per_person')));
create table public.budget_snapshots(plan_id uuid primary key references public.plans(id), version integer not null, plan_version integer not null, participant_ids uuid[] not null, total_minor bigint not null, shares jsonb not null, agreed_ids uuid[] not null default '{}');
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), body text not null, created_at timestamptz not null default now());
create table private.invitations(id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id), plan_id uuid not null references public.plans(id), token_hash text unique not null, preview_title text not null check(char_length(preview_title) between 3 and 160), expires_at timestamptz not null, max_uses integer not null check(max_uses between 1 and 50), uses_count integer not null default 0 check(uses_count>=0), revoked_at timestamptz, check(uses_count<=max_uses));
create table private.redemptions(invitation_id uuid not null references private.invitations(id), user_id uuid not null references public.profiles(id), primary key(invitation_id,user_id));
create table private.operations(user_id uuid not null, request_id uuid not null, payload jsonb not null, result_id uuid not null, primary key(user_id,request_id));
create table private.admin_roles(user_id uuid primary key references public.profiles(id));
create table private.audit_log(id uuid primary key default gen_random_uuid(), actor uuid, action text not null, entity uuid, created_at timestamptz not null default now());
create table private.reports(id uuid primary key default gen_random_uuid(), reporter uuid not null references public.profiles(id), listing_id uuid not null references public.listings(id), reason text not null check(char_length(reason) between 3 and 1000));
create table private.deletion_requests(user_id uuid primary key references public.profiles(id), requested_at timestamptz not null default now());
create table private.rate_limits(actor text not null, action text not null, bucket timestamptz not null, hits integer not null, primary key(actor,action,bucket));
create index listings_catalog on public.listings(publication_status,city,category);
create index listings_author on public.listings(created_by);
create index member_user on public.group_members(user_id,status,group_id);
create index plans_group on public.plans(group_id,starts_at);
create index rsvps_user on public.plan_rsvps(user_id);
create index messages_group on public.room_messages(group_id,created_at,id);
create index budget_plan on public.budget_items(plan_id);
create index notifications_user on public.notifications(user_id,created_at);
create index invitations_group on private.invitations(group_id);

create function private.member(g uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.group_members where group_id=g and user_id=auth.uid() and status='active')$$;
create function private.admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.admin_roles where user_id=auth.uid())$$;
create function private.require_user() returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=auth.uid();begin if u is null then raise exception 'NOT_AUTHENTICATED';end if;return u;end$$;
create function private.limit_action(p_action text,p_max integer) returns void language plpgsql security definer set search_path='' as $$declare n integer;begin
 insert into private.rate_limits values(coalesce(auth.uid()::text,'anonymous'),p_action,date_trunc('minute',now()),1) on conflict(actor,action,bucket) do update set hits=private.rate_limits.hits+1 returning hits into n;
 if n>p_max then raise exception 'RATE_LIMIT';end if;
end$$;
create function private.lock_plan(p_id uuid,p_version integer default null,p_owner boolean default false) returns public.plans language plpgsql security definer set search_path='' as $$declare p public.plans;begin
 perform private.require_user(); select * into p from public.plans where id=p_id for update;
 perform 1 from public.groups where id=p.group_id for update;
 if p.id is null or not private.member(p.group_id) then raise exception 'NOT_FOUND';end if;
 if p_owner and not exists(select 1 from public.groups where id=p.group_id and owner_id=auth.uid()) then raise exception 'FORBIDDEN';end if;
 if p_version is not null and p.version<>p_version then raise exception 'VERSION_CONFLICT';end if; return p;
end$$;
create function private.new_user() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.profiles(id) values(new.id);return new;end$$;
create trigger create_profile after insert on auth.users for each row execute function private.new_user();

-- No direct writes; even SDK clients must use the same transactions as the UI.
do $$declare t text;begin foreach t in array array['profiles','listings','saved_listings','groups','group_members','plans','plan_versions','plan_rsvps','room_messages','budget_items','budget_snapshots','notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;end$$;
grant select(id,title,city,category,summary,address,latitude,longitude,source_url,checked_at,origin,price_minor,image_url,publication_status) on public.listings to anon,authenticated;
create policy catalog_read on public.listings for select using(publication_status='published');
grant select on public.saved_listings to authenticated;
create policy own_saved on public.saved_listings for select to authenticated using(user_id=auth.uid());
grant select on public.profiles to authenticated;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
grant select on public.groups,public.group_members,public.plans,public.plan_versions,public.plan_rsvps,public.room_messages,public.budget_items,public.budget_snapshots,public.notifications to authenticated;
create policy group_read on public.groups for select to authenticated using(private.member(id));
create policy member_read on public.group_members for select to authenticated using(private.member(group_id));
create policy plan_read on public.plans for select to authenticated using(private.member(group_id));
create policy version_read on public.plan_versions for select to authenticated using(exists(select 1 from public.plans p where p.id=plan_id and private.member(p.group_id)));
create policy rsvp_read on public.plan_rsvps for select to authenticated using(exists(select 1 from public.plans p where p.id=plan_id and private.member(p.group_id)));
create policy message_read on public.room_messages for select to authenticated using(private.member(group_id));
create policy item_read on public.budget_items for select to authenticated using(exists(select 1 from public.plans p where p.id=plan_id and private.member(p.group_id)));
create policy snapshot_read on public.budget_snapshots for select to authenticated using(exists(select 1 from public.plans p where p.id=plan_id and private.member(p.group_id)));
create policy notification_read on public.notifications for select to authenticated using(user_id=auth.uid());
grant usage on schema private to authenticated;
grant execute on function private.member(uuid) to authenticated;

create function public.update_profile(p_name text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.require_user();update public.profiles set display_name=trim(p_name) where id=auth.uid();end$$;
create function public.toggle_saved(p_listing uuid,p_save boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.require_user();if p_save then
 if not exists(select 1 from public.listings where id=p_listing and publication_status='published') then raise exception 'NOT_FOUND';end if;
 insert into public.saved_listings values(auth.uid(),p_listing) on conflict do nothing;
 else delete from public.saved_listings where user_id=auth.uid() and listing_id=p_listing;end if;end$$;
create function public.my_plans() returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('owner_id',g.owner_id) order by p.starts_at),'[]') from public.plans p join public.groups g on g.id=p.group_id where private.member(g.id)$$;
create function public.create_plan(p_listing uuid,p_title text,p_starts timestamptz,p_meeting text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();g uuid;pid uuid;op private.operations;payload jsonb:=jsonb_build_object('listing',p_listing,'title',p_title,'starts',p_starts,'meeting',p_meeting);begin
 perform pg_advisory_xact_lock(hashtext(u::text||p_request::text));
 select * into op from private.operations where user_id=u and request_id=p_request;
 if found then if op.payload<>payload then raise exception 'VERSION_CONFLICT';end if;return op.result_id;end if;
 perform private.limit_action('create_plan',10);
 if p_starts<=now() or p_starts>now()+interval '2 years' or p_request is null then raise exception 'INVALID_INPUT';end if;
 if not exists(select 1 from public.listings where id=p_listing and publication_status='published') then raise exception 'NOT_FOUND';end if;
 insert into public.groups(owner_id,title) values(u,p_title) returning id into g;
 insert into public.group_members values(g,u,'active');
 insert into public.plans(group_id,listing_id,title,starts_at,meeting_note) values(g,p_listing,trim(p_title),p_starts,trim(p_meeting)) returning id into pid;
 insert into public.plan_versions select pid,1,to_jsonb(p) from public.plans p where id=pid;
 insert into private.operations values(u,p_request,payload,pid);return pid;
end$$;
create function public.plan_action(p_plan uuid,p_version integer,p_action text,p_values jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,p_version,true);target text;begin
 if p_version is null then raise exception 'VERSION_CONFLICT';end if;
 if p.status in ('cancelled','completed') then raise exception 'INVALID_TRANSITION';end if;
 if p_action='edit' or p_action='revise' then
 if p_action='edit' and p.status='confirmed' then raise exception 'INVALID_TRANSITION';end if;
 if p_action='revise' and p.status<>'confirmed' then raise exception 'INVALID_TRANSITION';end if;
 update public.plans set title=coalesce(p_values->>'title',title),starts_at=coalesce((p_values->>'starts_at')::timestamptz,starts_at),meeting_note=coalesce(p_values->>'meeting_note',meeting_note),status=case when p.status='confirmed' then 'proposed' else p.status end,version=version+1 where id=p.id;
 insert into public.plan_versions select id,version,to_jsonb(x) from public.plans x where id=p.id;
 else
 target:=case p_action when 'publish' then 'proposed' when 'confirm' then 'confirmed' when 'cancel' then 'cancelled' when 'complete' then 'completed' end;
 if target is null or (p_action='publish' and p.status<>'draft') or (p_action='confirm' and p.status<>'proposed') or (p_action='complete' and (p.status<>'confirmed' or p.starts_at>now())) then raise exception 'INVALID_TRANSITION';end if;
 if p_action='confirm' and not exists(select 1 from public.plan_rsvps r join public.group_members m on m.group_id=p.group_id and m.user_id=r.user_id and m.status='active' where r.plan_id=p.id and r.answer='going' and r.acknowledged_version=p.version) then raise exception 'NO_PARTICIPANTS';end if;
 update public.plans set status=target where id=p.id;
 end if;
 insert into private.audit_log(actor,action,entity) values(auth.uid(),p_action,p.id);
 insert into public.notifications(user_id,body) select user_id,'План обновлён. Проверьте договорённости.' from public.group_members where group_id=p.group_id and status='active';
end$$;
create function public.set_rsvp(p_plan uuid,p_version integer,p_answer text) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,p_version);begin
 if p_version is null then raise exception 'VERSION_CONFLICT';end if;
 if p.status not in ('proposed','confirmed') or p.starts_at<=now() then raise exception 'INVALID_TRANSITION';end if;
 insert into public.plan_rsvps values(p.id,auth.uid(),p_answer,p.version) on conflict(plan_id,user_id) do update set answer=excluded.answer,acknowledged_version=excluded.acknowledged_version;
end$$;
create function public.create_invitation(p_plan uuid,p_title text) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,null,true);t text:=encode(extensions.gen_random_bytes(32),'hex');iid uuid;begin
 perform private.limit_action('invite',10);if p.status not in ('proposed','confirmed') then raise exception 'INVALID_TRANSITION';end if;
 insert into private.invitations(group_id,plan_id,token_hash,preview_title,expires_at,max_uses) values(p.group_id,p.id,encode(extensions.digest(t,'sha256'),'hex'),trim(p_title),now()+interval '7 days',20) returning id into iid;
 return jsonb_build_object('token',t,'id',iid);end$$;
create function public.preview_invitation(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$declare i private.invitations;begin
 perform private.limit_action('preview',120);
 select * into i from private.invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now() and uses_count<max_uses;
 if i.id is null or length(p_token)<>64 then raise exception 'INVALID_INVITATION';end if;
 return jsonb_build_object('title',i.preview_title,'expires_at',i.expires_at);end$$;
create function public.redeem_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();i private.invitations;member_status text;begin
 perform private.limit_action('redeem',20);
 select * into i from private.invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if i.id is null or i.revoked_at is not null or i.expires_at<=now() or length(p_token)<>64 then raise exception 'INVALID_INVITATION';end if;
 perform 1 from public.groups where id=i.group_id for update;
 select status into member_status from public.group_members where group_id=i.group_id and user_id=u;
 if member_status='active' then return i.plan_id;end if;
 -- A removed/left user cannot reuse an already consumed link.
 if exists(select 1 from private.redemptions where invitation_id=i.id and user_id=u) or i.uses_count>=i.max_uses then raise exception 'INVALID_INVITATION';end if;
 insert into public.group_members values(i.group_id,u,'active') on conflict(group_id,user_id) do update set status='active';
 insert into private.redemptions values(i.id,u);update private.invitations set uses_count=uses_count+1 where id=i.id;
 return i.plan_id;end$$;
create function public.revoke_invitation(p_invitation uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from private.invitations i join public.groups g on g.id=i.group_id where i.id=p_invitation and g.owner_id=auth.uid()) then raise exception 'FORBIDDEN';end if;
 update private.invitations set revoked_at=now() where id=p_invitation;end$$;
create function public.send_message(p_plan uuid,p_body text,p_request uuid) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan);begin
 perform private.limit_action('message',30);
 insert into public.room_messages(group_id,author_id,body,request_id) values(p.group_id,auth.uid(),trim(p_body),p_request) on conflict(author_id,request_id) do nothing;end$$;
create function public.add_budget_item(p_plan uuid,p_version integer,p_title text,p_amount bigint,p_kind text) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,p_version,true);begin
 if p_version is null then raise exception 'VERSION_CONFLICT';end if;
 if p.status in ('cancelled','completed') then raise exception 'INVALID_TRANSITION';end if;
 insert into public.budget_items(plan_id,title,amount_minor,cost_kind) values(p.id,trim(p_title),p_amount,p_kind);
 update public.budget_snapshots set plan_version=0 where plan_id=p.id;end$$;
create function public.remove_budget_item(p_plan uuid,p_version integer,p_item uuid) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,p_version,true);begin
 if p_version is null then raise exception 'VERSION_CONFLICT';end if;
 if p.status in ('cancelled','completed') then raise exception 'INVALID_TRANSITION';end if;
 delete from public.budget_items where id=p_item and plan_id=p.id;update public.budget_snapshots set plan_version=0 where plan_id=p.id;end$$;
create function public.recalculate_budget(p_plan uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,p_version,true);ids uuid[];n integer;shared bigint;each_person bigint;total bigint;parts jsonb:='{}';i integer;begin
 if p_version is null then raise exception 'VERSION_CONFLICT';end if;
 if p.status in ('cancelled','completed') then raise exception 'INVALID_TRANSITION';end if;
 select array_agg(r.user_id order by r.user_id) into ids from public.plan_rsvps r join public.group_members m on m.user_id=r.user_id and m.group_id=p.group_id and m.status='active' where r.plan_id=p.id and r.answer='going' and r.acknowledged_version=p.version;
 n:=coalesce(array_length(ids,1),0);if n=0 then raise exception 'NO_PARTICIPANTS';end if;
 -- Divide each item separately, identical to shared TypeScript domain logic.
 for i in 1..n loop
 select coalesce(sum(case when cost_kind='per_person' then amount_minor else amount_minor/n+case when i<=amount_minor%n then 1 else 0 end end),0) into each_person from public.budget_items where plan_id=p.id;
 parts:=parts||jsonb_build_object(ids[i]::text,each_person::text);
 end loop;
 select coalesce(sum(case when cost_kind='shared' then amount_minor else amount_minor*n end),0) into total from public.budget_items where plan_id=p.id;
 insert into public.budget_snapshots values(p.id,1,p.version,ids,total,parts,'{}') on conflict(plan_id) do update set version=public.budget_snapshots.version+1,plan_version=excluded.plan_version,participant_ids=excluded.participant_ids,total_minor=excluded.total_minor,shares=excluded.shares,agreed_ids='{}';
end$$;
create function public.agree_budget(p_plan uuid,p_budget_version integer) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan);s public.budget_snapshots;ids uuid[];begin
 if p.status in ('cancelled','completed') then raise exception 'INVALID_TRANSITION';end if;
 select * into s from public.budget_snapshots where plan_id=p.id;
 select array_agg(r.user_id order by r.user_id) into ids from public.plan_rsvps r join public.group_members m on m.user_id=r.user_id and m.group_id=p.group_id and m.status='active' where r.plan_id=p.id and r.answer='going' and r.acknowledged_version=p.version;
 if s.plan_version<>p.version or s.participant_ids is distinct from ids or s.version<>p_budget_version or not(auth.uid()=any(s.participant_ids)) or s.plan_id is null then raise exception 'BUDGET_STALE';end if;
 update public.budget_snapshots set agreed_ids=array(select distinct x from unnest(agreed_ids||auth.uid()) x) where plan_id=p.id;end$$;
create function public.get_room(p_plan uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan);o uuid;begin
 select owner_id into o from public.groups where id=p.group_id;
 return jsonb_build_object(
 'plan',to_jsonb(p)||jsonb_build_object('owner_id',o),
 'members',coalesce((select jsonb_agg(jsonb_build_object('group_id',m.group_id,'user_id',m.user_id,'display_name',pr.display_name,'status',m.status)) from public.group_members m join public.profiles pr on pr.id=m.user_id where m.group_id=p.group_id and m.status='active'),'[]'),
 'rsvps',coalesce((select jsonb_agg(to_jsonb(r)) from public.plan_rsvps r join public.group_members m on m.group_id=p.group_id and m.user_id=r.user_id and m.status='active' where r.plan_id=p.id),'[]'),
 'messages',coalesce((select jsonb_agg(to_jsonb(x) order by created_at) from (select id,group_id,author_id,body,created_at from public.room_messages where group_id=p.group_id order by created_at desc,id desc limit 50) x),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('amount_minor',b.amount_minor::text)) from public.budget_items b where plan_id=p.id),'[]'),
 'budget',(select to_jsonb(b)||jsonb_build_object('total_minor',b.total_minor::text) from public.budget_snapshots b where plan_id=p.id),
 'invitations',case when o=auth.uid() then coalesce((select jsonb_agg(jsonb_build_object('id',id,'expires_at',expires_at,'uses_count',uses_count,'max_uses',max_uses,'revoked_at',revoked_at)) from private.invitations where group_id=p.group_id),'[]') else '[]'::jsonb end);
end$$;
create function public.remove_member(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,null,true);begin
 if p_user=auth.uid() then raise exception 'OWNER_MUST_TRANSFER';end if;
 update public.group_members set status='removed' where group_id=p.group_id and user_id=p_user;
end$$;
create function public.transfer_ownership(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,null,true);begin
 perform 1 from public.groups where id=p.group_id for update;
 if not exists(select 1 from public.group_members where group_id=p.group_id and user_id=p_user and status='active') then raise exception 'FORBIDDEN';end if;
 update public.groups set owner_id=p_user where id=p.group_id;end$$;
create function public.leave_group(p_plan uuid) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan);begin
 if exists(select 1 from public.groups where id=p.group_id and owner_id=auth.uid()) then raise exception 'OWNER_MUST_TRANSFER';end if;
 update public.group_members set status='left' where group_id=p.group_id and user_id=auth.uid();end$$;
create function public.submit_listing(p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();lid uuid;begin
 perform private.limit_action('submission',5);
 insert into public.listings(title,city,category,summary,address,origin,publication_status,created_by) values(p_values->>'title',p_values->>'city',p_values->>'category',p_values->>'summary',p_values->>'address','user','pending_review',u) returning id into lid;return lid;end$$;
create function public.my_submissions() returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(to_jsonb(l) order by created_at desc),'[]') from public.listings l where created_by=auth.uid()$$;
create function public.review_queue() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not private.admin() then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(l)) from public.listings l where publication_status='pending_review'),'[]');end$$;
create function public.review_listing(p_listing uuid,p_publish boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.admin() then raise exception 'FORBIDDEN';end if;
 if p_publish and exists(select 1 from public.listings where id=p_listing and created_by=auth.uid()) then raise exception 'FORBIDDEN';end if;
 if not p_publish and char_length(trim(p_reason))<3 then raise exception 'INVALID_INPUT';end if;
 update public.listings set publication_status=case when p_publish then 'published' else 'rejected' end,rejection_reason=case when p_publish then null else left(p_reason,1000) end where id=p_listing and publication_status='pending_review';
 insert into private.audit_log(actor,action,entity) values(auth.uid(),case when p_publish then 'publish_listing' else 'reject_listing' end,p_listing);end$$;
create function public.report_listing(p_listing uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.require_user();perform private.limit_action('report',5);
 if not exists(select 1 from public.listings where id=p_listing and publication_status='published') then raise exception 'NOT_FOUND';end if;
 insert into private.reports(reporter,listing_id,reason) values(auth.uid(),p_listing,trim(p_reason));end$$;
create function public.my_notifications() returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(to_jsonb(n) order by created_at desc),'[]') from (select * from public.notifications where user_id=auth.uid() order by created_at desc limit 50) n$$;
create function public.request_deletion() returns void language plpgsql security definer set search_path='' as $$begin
 perform private.require_user();insert into private.deletion_requests(user_id) values(auth.uid()) on conflict do nothing;end$$;

-- Functions are not callable by PUBLIC. Private helpers are never RPC endpoints.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.member(uuid) to authenticated;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
 execute format('revoke all on function %s from public, anon, authenticated',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end$$;
grant execute on function public.preview_invitation(text) to anon;
revoke all on all tables in schema private from public,anon,authenticated;

create table private.schema_migrations(version text primary key,applied_at timestamptz not null default now());
revoke all on private.schema_migrations from public,anon,authenticated;
