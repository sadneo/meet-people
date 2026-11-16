-- Run after the dining migration. Everything, including fixtures, rolls back.
begin;

insert into public.dining_menus
  (source, external_id, location_slug, location_name, menu_slug, menu_name, menu_date, source_url, items, last_synced_at)
values
  ('sbu_hospital', 'dining-test:daily:2026-11-03', 'dining-test', 'Test Cafe', 'daily', 'Daily Menu',
   '2026-11-03', 'https://example.test/menu', '[{"name":"Soup"},{"name":"Pasta"}]', now());

-- A changed menu updates the same row and removes dishes no longer offered.
insert into public.dining_menus
  (source, external_id, location_slug, location_name, menu_slug, menu_name, menu_date, source_url, items, last_synced_at)
values
  ('sbu_hospital', 'dining-test:daily:2026-11-03', 'dining-test', 'Test Cafe', 'daily', 'Daily Menu',
   '2026-11-03', 'https://example.test/new-document', '[{"name":"Salad"}]', now())
on conflict (source, external_id) do update set items = excluded.items, source_url = excluded.source_url;

do $$
begin
  assert (select count(*) = 1 from public.dining_menus where location_slug = 'dining-test');
  assert (select items = '[{"name":"Salad"}]'::jsonb from public.dining_menus where location_slug = 'dining-test');
  assert not has_table_privilege('anon', 'public.dining_menus', 'select');
  assert not has_table_privilege('authenticated', 'public.dining_menus', 'insert');
  assert not has_table_privilege('authenticated', 'public.dining_menus', 'select');
  assert has_table_privilege('service_role', 'public.dining_menus', 'insert');
  assert (select relrowsecurity from pg_class where oid = 'public.dining_menus'::regclass);
end;
$$;

rollback;
