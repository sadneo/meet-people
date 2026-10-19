"""Execute candidate ACL guards with inherited privileges in rollback-only fixtures."""
import json, subprocess
from pathlib import Path
container='pebble-demo-final-20261019'
assert json.loads(subprocess.check_output(['docker','inspect','--format','{"network":{{json .HostConfig.NetworkMode}},"ports":{{json .NetworkSettings.Ports}}}',container]))==dict(network='none',ports={})
base=['docker','exec','-i',container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-d','pebble_safety_owner_disposable']
marker="do $$ begin if not exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1') then raise exception 'Wrong disposable';end if;end $$;"
cases=[
 ('photo RPC','docs/profile-photo-migration.sql','grant execute on function public.get_profile_photo_reference(uuid) to demo_acl_inherited;'),
 ('photo column','docs/profile-photo-migration.sql','grant select(jpeg) on photo_private.photos to demo_acl_inherited;'),
 ('photo mutation','docs/profile-photo-migration.sql','grant update on photo_private.requests to demo_acl_inherited;'),
 ('photo helper','docs/profile-photo-migration.sql','grant execute on function photo_private.lock_audience(uuid,uuid) to demo_acl_inherited;'),
 ('photo schema','docs/profile-photo-migration.sql','grant usage on schema photo_private to demo_acl_inherited;'),
 ('Dating RPC','docs/dating-live-migration.sql','grant execute on function public.find_dating_candidate(jsonb) to demo_acl_inherited;'),
 ('Dating helper','docs/dating-live-migration.sql','grant execute on function dating_private.people() to demo_acl_inherited;'),
 ('actor helper','docs/real-account-boundary.sql','grant execute on function safety_private.actor() to demo_acl_inherited;'),
 ('Friends runtime','docs/friends-runtime-migration.sql','grant execute on function public.get_friends_runtime() to demo_acl_inherited;'),
]
for name,path,grant in cases:
 source=Path(path).read_text();guard=source[source.rindex('do $$'):source.rindex('commit;')]
 script=marker+'begin;create role demo_acl_inherited nologin;grant demo_acl_inherited to anon;'+grant+guard+'rollback;'
 result=subprocess.run(base,input=script,text=True,capture_output=True)
 assert result.returncode!=0 and '42501' in result.stderr,(name,result.stdout,result.stderr)
 print('PASS inherited privilege rejected:',name)
result=subprocess.run(base,input="select not exists(select 1 from pg_roles where rolname='demo_acl_inherited');",text=True,capture_output=True)
assert result.returncode==0 and result.stdout.strip()=='t',result.stderr
print('PASS all injected privileges and roles rolled back')
