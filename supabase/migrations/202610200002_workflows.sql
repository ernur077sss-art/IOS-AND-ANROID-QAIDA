-- Complete draft/review flow and prevent re-entry through older unredeemed links.
alter table public.listings add column kind text not null default 'place' check(kind in ('place','event','experience'));
alter table public.listings add column event_starts timestamptz;
alter table public.listings add column out_of_city boolean not null default false;
alter table public.listings add column verified_fields text[] not null default '{}';
grant select(kind,event_starts,out_of_city,verified_fields) on public.listings to anon,authenticated;
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
create or replace function public.remove_member(p_plan uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,null,true);begin
 if p_user=auth.uid() then raise exception 'OWNER_MUST_TRANSFER';end if;
 update public.group_members set status='removed' where group_id=p.group_id and user_id=p_user;
 update private.invitations set revoked_at=now() where group_id=p.group_id and revoked_at is null;
end$$;
create function public.delete_message(p_plan uuid,p_message uuid) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan);begin
 update public.room_messages set body='[Сообщение удалено]' where id=p_message and group_id=p.group_id and author_id=auth.uid();
 if not found then raise exception 'FORBIDDEN';end if;end$$;
create function public.edit_budget_item(p_plan uuid,p_version integer,p_item uuid,p_title text,p_amount bigint,p_kind text) returns void language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,p_version,true);begin
 if p_version is null then raise exception 'VERSION_CONFLICT';end if;
 if p.status in ('cancelled','completed') then raise exception 'INVALID_TRANSITION';end if;
 update public.budget_items set title=trim(p_title),amount_minor=p_amount,cost_kind=p_kind where id=p_item and plan_id=p.id;
 if not found then raise exception 'NOT_FOUND';end if;
 update public.budget_snapshots set plan_version=0 where plan_id=p.id;end$$;
create function public.mark_notification(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 delete from public.notifications where id=p_id and user_id=private.require_user();end$$;
-- Replace, do not overload: PostgREST resolves old named calls via defaults.
drop function public.create_invitation(uuid,text);
create function public.create_invitation(p_plan uuid,p_title text,p_max_uses integer default 20,p_hours integer default 168) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.plans:=private.lock_plan(p_plan,null,true);t text:=encode(extensions.gen_random_bytes(32),'hex');iid uuid;begin
 perform private.limit_action('invite',10);
 if p.status not in ('proposed','confirmed') then raise exception 'INVALID_TRANSITION';end if;
 if p_hours is null or p_hours<1 or p_hours>168 or p_max_uses is null or p_max_uses<1 or p_max_uses>50 then raise exception 'INVALID_INPUT';end if;
 insert into private.invitations(group_id,plan_id,token_hash,preview_title,expires_at,max_uses) values(p.group_id,p.id,encode(extensions.digest(t,'sha256'),'hex'),trim(p_title),now()+make_interval(hours=>p_hours),p_max_uses) returning id into iid;
 return jsonb_build_object('token',t,'id',iid);end$$;
revoke all on function public.create_invitation(uuid,text,integer,integer),public.delete_message(uuid,uuid),public.edit_budget_item(uuid,integer,uuid,text,bigint,text),public.mark_notification(uuid) from public,anon,authenticated;
grant execute on function public.create_invitation(uuid,text,integer,integer),public.delete_message(uuid,uuid),public.edit_budget_item(uuid,integer,uuid,text,bigint,text),public.mark_notification(uuid) to authenticated;
create table public.occurrences(id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.listings(id),starts_at timestamptz not null,ends_at timestamptz,source_url text not null check(source_url ~ '^https://[^/@]+'),checked_at timestamptz not null,status text not null default 'scheduled' check(status in ('scheduled','cancelled','finished')),check(ends_at is null or ends_at>starts_at),unique(id,listing_id));
alter table public.occurrences enable row level security;
revoke all on public.occurrences from anon,authenticated;
grant select on public.occurrences to anon,authenticated;
create policy published_occurrences on public.occurrences for select using(exists(select 1 from public.listings where id=listing_id and publication_status='published'));
create index occurrences_listing on public.occurrences(listing_id,starts_at);
-- Storage enabled only for editorial assets. No user upload until moderation/EXIF pipeline exists.
-- Private uploads and service role are deliberately not introduced by this migration.
notify pgrst,'reload schema';
