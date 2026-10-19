-- Read-only metadata only. Never select Auth, profile, mailbox or secret values.
begin transaction read only;
set local statement_timeout='10s';
select current_database() as database,current_user as inspector;
select version from supabase_migrations.schema_migrations order by version;
select n.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_userbyid(p.proowner) as owner,p.prosecdef as definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in('safety_private','social_private','location_private','active_private','photo_private','dating_private')
or n.nspname='public' and p.proname in('get_account','save_account','get_profile_details','get_detailed_settings','get_friends_search_preferences','get_dating_preferences','resolve_search_area','get_queue_match','get_friends_runtime','get_dating_runtime','get_profile_photo_state','join_queue')
order by n.nspname,p.proname;
select table_schema,table_name,column_name,data_type from information_schema.columns
where table_schema='auth' and table_name='users' and column_name='is_anonymous'
or table_schema='public' and table_name in('profiles','account_settings','profile_details','detailed_settings','friends_search_preferences','dating_owner_aggregates','dating_search_location_refs','friends_search_location_refs')
order by table_schema,table_name,ordinal_position;
rollback;
