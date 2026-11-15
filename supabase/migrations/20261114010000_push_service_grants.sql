-- BYPASSRLS does not grant table privileges. The server registers devices and
-- the scheduled dispatcher reads/removes devices and acknowledges/prunes pushes.
-- Keep all direct client access denied; enqueue/claim remain definer functions.
grant select, insert, update, delete on public.push_devices to service_role;
grant select, update, delete on public.push_outbox to service_role;

do $$
declare permission text;
begin
  foreach permission in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if not has_table_privilege('service_role', 'public.push_devices', permission)
       or (permission <> 'INSERT' and not has_table_privilege('service_role', 'public.push_outbox', permission)) then
      raise exception 'Push service privilege missing: %', permission;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.push_devices', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.push_devices', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.push_outbox', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.push_outbox', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Push tables must remain inaccessible to clients';
  end if;
end $$;
