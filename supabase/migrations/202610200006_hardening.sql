-- Supabase's automatic RLS event trigger only needs the database owner.
do $$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable' and p.prorettype='event_trigger'::regtype) then
 revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end$$;
