-- Public RPCs are invoker wrappers. Elevated implementations live outside Data API.
-- Authorization still happens inside each private implementation via auth.uid().
do $$declare f record;args text;begin
 for f in select p.oid,p.proname,pg_get_function_arguments(p.oid) arguments,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_result(p.oid) result,p.pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype) order by p.proname loop
 select coalesce(string_agg('$'||i,',' order by i),'') into args from generate_series(1,f.pronargs) i;
 execute format('alter function public.%I(%s) set schema private',f.proname,f.identity_args);
 execute format('create function public.%I(%s) returns %s language sql security invoker set search_path=%L as %L',f.proname,f.arguments,f.result,'',format('select private.%I(%s)',f.proname,args));
 execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
 execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
 if f.proname='preview_invitation' then
 execute format('grant execute on function public.%I(%s) to anon',f.proname,f.identity_args);
 end if;
 end loop;
end$$;
grant usage on schema private to anon;
notify pgrst,'reload schema';
