-- Two-sided catalogue. Public directory entries are not registered partners.
create table public.providers (
 id uuid primary key default gen_random_uuid(), owner_id uuid references public.profiles(id),
 kind text not null check(kind in ('guide','driver','company','host')),
 city text not null check(city in ('semey','almaty')), name text not null check(char_length(name) between 2 and 160),
 description text not null check(char_length(description) between 10 and 2000), languages text not null default 'Уточнить',
 phone text check(phone is null or phone ~ '^\+[0-9]{10,15}$'), contact_url text check(contact_url is null or contact_url ~ '^https://[^/@]+'),
 source_url text check(source_url is null or source_url ~ '^https://[^/@]+'), checked_at timestamptz,
 listing_ids uuid[] not null default '{}', vehicle text, seats integer check(seats between 1 and 50),
 status text not null default 'draft' check(status in ('draft','pending','published','rejected')),
 verified boolean not null default false, rejection_reason text,
 version integer not null default 1, created_at timestamptz not null default now(),
 managed boolean generated always as (owner_id is not null) stored,
 check(kind<>'driver' or (nullif(trim(vehicle),'') is not null and seats is not null))
);
create table public.service_offers (
 id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id),
 listing_id uuid not null references public.listings(id), kind text not null check(kind in ('excursion','transport','tour','workshop')),
 title text not null check(char_length(title) between 3 and 160), program text not null check(char_length(program) between 10 and 4000),
 included text not null check(char_length(included) between 1 and 2000), excluded text not null check(char_length(excluded) between 1 and 2000),
 departure text not null check(char_length(departure) between 3 and 500), duration_minutes integer not null check(duration_minutes between 30 and 20160),
 min_guests integer not null default 1 check(min_guests between 1 and 50), max_guests integer not null check(max_guests between 1 and 50 and max_guests>=min_guests),
 price_minor bigint check(price_minor between 0 and 100000000000), price_basis text not null check(price_basis in ('person','group')),
 cancellation text not null check(char_length(cancellation) between 3 and 2000),
 status text not null default 'draft' check(status in ('draft','pending','published','rejected')), rejection_reason text,
 version integer not null default 1, created_at timestamptz not null default now()
);
create table public.trip_requests (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.profiles(id),
 provider_id uuid not null references public.providers(id), offer_id uuid not null references public.service_offers(id),
 plan_id uuid references public.plans(id), plan_version integer, party_fingerprint text,
 guests integer not null check(guests between 1 and 50), starts_at timestamptz not null,
 contact_name text not null check(char_length(contact_name) between 1 and 80), contact_phone text not null check(contact_phone ~ '^\+[0-9]{10,15}$'),
 note text not null default '' check(char_length(note)<=2000), offer_snapshot jsonb not null,
 status text not null default 'sent' check(status in ('sent','proposed','confirmed','declined','cancelled','completed')),
 proposed_starts timestamptz, proposed_total_minor bigint check(proposed_total_minor between 0 and 100000000000),
 response text not null default '' check(char_length(response)<=2000), version integer not null default 1,
 request_key uuid not null, created_at timestamptz not null default now(), unique(customer_id,request_key)
);
create unique index one_live_group_request on public.trip_requests(plan_id,offer_id) where plan_id is not null and status in ('sent','proposed','confirmed');
create index offers_listing on public.service_offers(listing_id,status);
create index provider_city on public.providers(city,status);
create index requests_provider on public.trip_requests(provider_id,created_at desc);
create index requests_customer on public.trip_requests(customer_id,created_at desc);
create table private.request_events(id uuid primary key default gen_random_uuid(), request_id uuid not null references public.trip_requests(id), actor_id uuid not null references public.profiles(id), action text not null, version integer not null, created_at timestamptz not null default now());

alter table public.providers enable row level security;
alter table public.service_offers enable row level security;
alter table public.trip_requests enable row level security;
revoke all on public.providers,public.service_offers,public.trip_requests from public,anon,authenticated;
-- Public reads expose no account ownership; all contacts are explicitly submitted for publication.
grant select(id,kind,city,name,description,languages,phone,contact_url,source_url,checked_at,vehicle,seats,status,verified,version,managed,listing_ids) on public.providers to anon,authenticated;
create policy provider_public on public.providers for select using(status='published');
grant select on public.service_offers to anon,authenticated;
create policy offer_public on public.service_offers for select using(status='published' and exists(select 1 from public.providers p where p.id=provider_id and p.status='published'));
-- Requests have no direct Data API access. RPC returns only actor-scoped rows.

create function private.save_provider(p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();p public.providers;pid uuid:=nullif(p_values->>'id','')::uuid;begin
 perform private.limit_action('provider_save',10);
 if coalesce(p_values->>'publish_contacts','') not in ('true','on') then raise exception 'CONTACT_CONSENT_REQUIRED';end if;
 if nullif(p_values->>'phone','') is null and nullif(p_values->>'contact_url','') is null then raise exception 'CONTACT_REQUIRED';end if;
 if pid is null then
  insert into public.providers(owner_id,kind,city,name,description,languages,phone,contact_url,vehicle,seats,status) values(u,p_values->>'kind',p_values->>'city',trim(p_values->>'name'),trim(p_values->>'description'),coalesce(nullif(p_values->>'languages',''),'Уточнить'),nullif(p_values->>'phone',''),nullif(p_values->>'contact_url',''),nullif(p_values->>'vehicle',''),nullif(p_values->>'seats','')::integer,'pending') returning id into pid;
 else
  select * into p from public.providers where id=pid for update;
  if p.owner_id is distinct from u then raise exception 'FORBIDDEN';end if;
  if (p_values->>'version')::integer is distinct from p.version then raise exception 'VERSION_CONFLICT';end if;
  update public.providers set kind=p_values->>'kind',city=p_values->>'city',name=trim(p_values->>'name'),description=trim(p_values->>'description'),languages=coalesce(nullif(p_values->>'languages',''),'Уточнить'),phone=nullif(p_values->>'phone',''),contact_url=nullif(p_values->>'contact_url',''),vehicle=nullif(p_values->>'vehicle',''),seats=nullif(p_values->>'seats','')::integer,status='pending',verified=false,checked_at=null,rejection_reason=null,version=version+1 where id=pid;
 end if;return pid;end$$;
create function private.save_offer(p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();pid uuid:=(p_values->>'provider_id')::uuid;oid uuid:=nullif(p_values->>'id','')::uuid;o public.service_offers;begin
 perform private.limit_action('offer_save',10);
 if not exists(select 1 from public.providers where id=pid and owner_id=u) then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.providers where id=pid and kind='driver' and (p_values->>'max_guests')::integer>seats) then raise exception 'PARTY_SIZE';end if;
 if not exists(select 1 from public.listings where id=(p_values->>'listing_id')::uuid and publication_status='published') then raise exception 'NOT_FOUND';end if;
 if oid is not null then
  select * into o from public.service_offers where id=oid for update;
  if o.provider_id is distinct from pid then raise exception 'FORBIDDEN';end if;
  if (p_values->>'version')::integer is distinct from o.version then raise exception 'VERSION_CONFLICT';end if;
 end if;
 if oid is null then
  insert into public.service_offers(provider_id,listing_id,kind,title,program,included,excluded,departure,duration_minutes,min_guests,max_guests,price_minor,price_basis,cancellation,status) values(pid,(p_values->>'listing_id')::uuid,p_values->>'kind',trim(p_values->>'title'),trim(p_values->>'program'),trim(p_values->>'included'),trim(p_values->>'excluded'),trim(p_values->>'departure'),(p_values->>'duration_minutes')::integer,(p_values->>'min_guests')::integer,(p_values->>'max_guests')::integer,nullif(p_values->>'price_minor','')::bigint,p_values->>'price_basis',trim(p_values->>'cancellation'),'pending') returning id into oid;
 else
  update public.service_offers set listing_id=(p_values->>'listing_id')::uuid,kind=p_values->>'kind',title=trim(p_values->>'title'),program=trim(p_values->>'program'),included=trim(p_values->>'included'),excluded=trim(p_values->>'excluded'),departure=trim(p_values->>'departure'),duration_minutes=(p_values->>'duration_minutes')::integer,min_guests=(p_values->>'min_guests')::integer,max_guests=(p_values->>'max_guests')::integer,price_minor=nullif(p_values->>'price_minor','')::bigint,price_basis=p_values->>'price_basis',cancellation=trim(p_values->>'cancellation'),status='pending',rejection_reason=null,version=version+1 where id=oid;
 end if;return oid;end$$;
create function private.provider_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.require_user();return jsonb_build_object('providers',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]') from public.providers p where owner_id=auth.uid()),'offers',(select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc),'[]') from public.service_offers o join public.providers p on p.id=o.provider_id where p.owner_id=auth.uid()));end$$;
create function private.partner_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.admin() then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('providers',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.providers p where status='pending'),'offers',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from public.service_offers o where status='pending'));end$$;
create function private.review_partner(p_kind text,p_id uuid,p_version integer,p_publish boolean,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$declare owner uuid;v integer;begin
 if not private.admin() then raise exception 'FORBIDDEN';end if;
 if not p_publish and char_length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED';end if;
 if p_kind='provider' then
  select owner_id,version into owner,v from public.providers where id=p_id for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if owner=auth.uid() then raise exception 'SELF_REVIEW';end if;
  if p_version is distinct from v then raise exception 'VERSION_CONFLICT';end if;
  update public.providers set status=case when p_publish then 'published' else 'rejected' end,verified=p_publish,checked_at=case when p_publish then now() else null end,rejection_reason=case when p_publish then null else p_reason end,version=version+1 where id=p_id;
 elsif p_kind='offer' then
  perform 1 from public.service_offers where id=p_id for update;
  select p.owner_id,o.version into owner,v from public.service_offers o join public.providers p on p.id=o.provider_id where o.id=p_id;
  if not found then raise exception 'NOT_FOUND';end if;
  if owner=auth.uid() then raise exception 'SELF_REVIEW';end if;
  if p_version is distinct from v then raise exception 'VERSION_CONFLICT';end if;
  if p_publish and not exists(select 1 from public.service_offers o join public.providers p on p.id=o.provider_id where o.id=p_id and p.status='published' and p.owner_id is not null) then raise exception 'PARTNER_NOT_READY';end if;
  update public.service_offers set status=case when p_publish then 'published' else 'rejected' end,rejection_reason=case when p_publish then null else p_reason end,version=version+1 where id=p_id;
 else raise exception 'INVALID_INPUT';end if;
 insert into private.audit_log(actor,action,entity) values(auth.uid(),'partner_review_'||p_kind,p_id);
end$$;

create function private.party_fingerprint(p_plan uuid) returns text language sql stable security definer set search_path='' as $$select encode(extensions.digest(coalesce(string_agg(r.user_id::text,',' order by r.user_id),''),'sha256'),'hex') from public.plan_rsvps r join public.plans p on p.id=r.plan_id join public.group_members m on m.group_id=p.group_id and m.user_id=r.user_id where p.id=p_plan and r.answer='going' and r.acknowledged_version=p.version and m.status='active'$$;
create function private.send_trip_request(p_values jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();o public.service_offers;p public.providers;r public.trip_requests;pl public.plans;rid uuid;guests integer:=(p_values->>'guests')::integer;pk uuid:=(p_values->>'request_key')::uuid;plan uuid:=nullif(p_values->>'plan_id','')::uuid;fp text;begin
 perform pg_advisory_xact_lock(hashtext(u::text||pk::text));
 select * into r from public.trip_requests where customer_id=u and request_key=pk;
 if found then
  if r.offer_id is distinct from (p_values->>'offer_id')::uuid or r.plan_id is distinct from plan or r.starts_at is distinct from (p_values->>'starts_at')::timestamptz or r.guests is distinct from guests or r.contact_phone is distinct from p_values->>'contact_phone' or r.contact_name is distinct from trim(p_values->>'contact_name') or r.note is distinct from coalesce(p_values->>'note','') or (r.offer_snapshot->>'version')::integer is distinct from (p_values->>'offer_version')::integer or r.plan_version is distinct from nullif(p_values->>'plan_version','')::integer then raise exception 'VERSION_CONFLICT';end if;return r.id;
 end if;
 perform private.limit_action('trip_request',5);
 select * into o from public.service_offers where id=(p_values->>'offer_id')::uuid for share;
 select * into p from public.providers where id=o.provider_id for share;
 if o.status is distinct from 'published' or p.status is distinct from 'published' or p.owner_id is null then raise exception 'NOT_FOUND';end if;
 if p.owner_id=u then raise exception 'SELF_REQUEST';end if;
 if (p_values->>'offer_version')::integer is distinct from o.version then raise exception 'VERSION_CONFLICT';end if;
 if (p_values->>'starts_at')::timestamptz<=now() or (p_values->>'starts_at')::timestamptz>now()+interval '2 years' or pk is null then raise exception 'INVALID_INPUT';end if;
 if coalesce(p_values->>'contact_consent','') not in ('true','on') then raise exception 'CONTACT_CONSENT_REQUIRED';end if;
 if p.kind='driver' and guests>p.seats then raise exception 'PARTY_SIZE';end if;
 if plan is not null then
  pl:=private.lock_plan(plan,(p_values->>'plan_version')::integer,true);
  if (p_values->>'plan_version')::integer is distinct from pl.version then raise exception 'VERSION_CONFLICT';end if;
  if pl.status not in ('proposed','confirmed') or pl.listing_id is distinct from o.listing_id or pl.starts_at is distinct from (p_values->>'starts_at')::timestamptz then raise exception 'PLAN_NOT_READY';end if;
  if guests<>(select count(*) from public.plan_rsvps sr join public.group_members m on m.user_id=sr.user_id and m.group_id=pl.group_id where sr.plan_id=plan and sr.answer='going' and sr.acknowledged_version=pl.version and m.status='active') or guests<1 then raise exception 'PARTY_CHANGED';end if;
  fp:=private.party_fingerprint(plan);
 end if;
 if guests<o.min_guests or guests>o.max_guests then raise exception 'PARTY_SIZE';end if;
 insert into public.trip_requests(customer_id,provider_id,offer_id,plan_id,plan_version,party_fingerprint,guests,starts_at,contact_name,contact_phone,note,offer_snapshot,request_key) values(u,p.id,o.id,plan,pl.version,fp,guests,(p_values->>'starts_at')::timestamptz,trim(p_values->>'contact_name'),p_values->>'contact_phone',coalesce(p_values->>'note',''),to_jsonb(o)||jsonb_build_object('provider_name',p.name,'provider_kind',p.kind,'vehicle',p.vehicle,'seats',p.seats),pk) returning id into rid;
 insert into private.request_events(request_id,actor_id,action,version) values(rid,u,'sent',1);return rid;
end$$;
create function private.my_trip_requests() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.require_user();return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('provider_name',p.name,'is_provider',p.owner_id=auth.uid(),'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'version',e.version,'created_at',e.created_at) order by e.created_at,e.id),'[]') from private.request_events e where e.request_id=r.id)) order by r.created_at desc) from public.trip_requests r join public.providers p on p.id=r.provider_id where r.customer_id=auth.uid() or p.owner_id=auth.uid()),'[]');end$$;
create function private.respond_trip_request(p_id uuid,p_version integer,p_action text,p_starts timestamptz default null,p_total bigint default null,p_message text default '') returns void language plpgsql security definer set search_path='' as $$declare u uuid:=private.require_user();r public.trip_requests;owner uuid;pl public.plans;begin
 perform private.limit_action('trip_response',20);
 select * into r from public.trip_requests where id=p_id for update;
 select owner_id into owner from public.providers where id=r.provider_id;
 if r.id is null or (u is distinct from r.customer_id and u is distinct from owner) then raise exception 'NOT_FOUND';end if;
 if p_version is distinct from r.version then raise exception 'VERSION_CONFLICT';end if;
 if p_action='propose' then
  if owner is distinct from u or r.status not in ('sent','proposed') then raise exception 'INVALID_TRANSITION';end if;
  if p_starts is null or p_starts<=now() or p_starts>now()+interval '2 years' or p_total is null or p_total<0 then raise exception 'INVALID_INPUT';end if;
  update public.trip_requests set status='proposed',proposed_starts=p_starts,proposed_total_minor=p_total,response=p_message,version=version+1 where id=p_id;
 elsif p_action='accept' then
  if r.customer_id is distinct from u or r.status<>'proposed' or r.proposed_starts<=now() then raise exception 'INVALID_TRANSITION';end if;
  if r.plan_id is not null then
   pl:=private.lock_plan(r.plan_id,r.plan_version,true);
   if pl.version is distinct from r.plan_version or pl.status not in ('proposed','confirmed') or private.party_fingerprint(r.plan_id) is distinct from r.party_fingerprint then raise exception 'PARTY_CHANGED';end if;
   if r.proposed_starts is distinct from pl.starts_at then raise exception 'PLAN_NOT_READY';end if;
   -- A group must have agreed to a budget covering the quoted total for its current composition/version.
   if not exists(select 1 from public.budget_snapshots b where b.plan_id=pl.id and b.plan_version=pl.version and b.total_minor>=r.proposed_total_minor and b.participant_ids=(select array_agg(x.user_id order by x.user_id) from public.plan_rsvps x join public.group_members m on m.group_id=pl.group_id and m.user_id=x.user_id where x.plan_id=pl.id and x.answer='going' and x.acknowledged_version=pl.version and m.status='active') and b.agreed_ids @> b.participant_ids) then raise exception 'GROUP_BUDGET_NOT_AGREED';end if;
  end if;
  update public.trip_requests set status='confirmed',version=version+1 where id=p_id;
 elsif p_action='decline' then
  if owner is distinct from u or r.status not in ('sent','proposed') then raise exception 'INVALID_TRANSITION';end if;
  if char_length(trim(p_message))<3 then raise exception 'REASON_REQUIRED';end if;
  update public.trip_requests set status='declined',response=p_message,version=version+1 where id=p_id;
 elsif p_action='cancel' then
  if r.customer_id is distinct from u or r.status not in ('sent','proposed','confirmed') then raise exception 'INVALID_TRANSITION';end if;
  update public.trip_requests set status='cancelled',version=version+1 where id=p_id;
 else raise exception 'INVALID_INPUT';end if;
 insert into private.request_events(request_id,actor_id,action,version) values(p_id,u,p_action,r.version+1);
end$$;
-- Invoker entrypoints; privileged implementations stay outside PostgREST.
do $$declare n text;args text;ident text;result text;pos text;begin
 for n,args,ident,result,pos in select * from (values
 ('save_provider','p_values jsonb','jsonb','uuid','$1'),
 ('save_offer','p_values jsonb','jsonb','uuid','$1'),
 ('provider_workspace','','','jsonb',''),
 ('partner_queue','','','jsonb',''),
 ('review_partner','p_kind text,p_id uuid,p_version integer,p_publish boolean,p_reason text default ''''','text,uuid,integer,boolean,text','void','$1,$2,$3,$4,$5'),
 ('send_trip_request','p_values jsonb','jsonb','uuid','$1'),
 ('my_trip_requests','','','jsonb',''),
 ('respond_trip_request','p_id uuid,p_version integer,p_action text,p_starts timestamptz default null,p_total bigint default null,p_message text default ''''','uuid,integer,text,timestamptz,bigint,text','void','$1,$2,$3,$4,$5,$6')
 ) x loop
 execute format('revoke all on function private.%I(%s) from public,anon',n,ident);
 execute format('grant execute on function private.%I(%s) to authenticated',n,ident);
 execute format('create function public.%I(%s) returns %s language sql security invoker set search_path=%L as %L',n,args,result,'',format('select private.%I(%s)',n,pos));
 execute format('revoke all on function public.%I(%s) from public,anon',n,ident);
 execute format('grant execute on function public.%I(%s) to authenticated',n,ident);
 end loop;
end$$;
revoke all on function private.party_fingerprint(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
