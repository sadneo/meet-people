-- iOS devices register FCM tokens too (Firebase bridges them to APNs), so the dispatcher is unchanged.
alter table public.push_devices drop constraint if exists push_devices_platform_check;
alter table public.push_devices add constraint push_devices_platform_check check (platform in ('android', 'ios'));
