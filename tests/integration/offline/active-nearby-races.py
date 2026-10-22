"""Real two-session active-result safety; fixed offline target, synthetic fixtures.
No live Auth/PostgREST claim. Every case observes actual blocking, not a timed sleep.
"""
import json, selectors, subprocess, time
from pathlib import Path
CONTAINER='pebble-safety-review-20261019-final'
BASE=['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-d','pebble_safety_owner_disposable']
A='af000000-0000-4000-8000-000000000001';B='af000000-0000-4000-8000-000000000002'
def sql(source):
 p=subprocess.run(BASE,input=source,text=True,capture_output=True);assert p.returncode==0,p.stderr;return p.stdout.strip()
def actor(owner,source):return f"set local role authenticated;set local request.jwt.claim.sub='{owner}';{source}"
def setup():
 source=Path('tests/integration/sql/active-nearby.sql').read_text().split('-- Farther candidate')[0].replace('\\set ON_ERROR_STOP on','')
 sql("set pebble.safety_owner_test_target='network-none-safety-owner-v1';"+source+'commit;')
def cleanup():
 sql("begin;do $$ begin if exists(select 1 from public.profiles where id::text like 'af000000-%' and username not like 'active-fixture-%') then raise exception 'Unknown fixture';end if;end $$;delete from auth.users where id::text like 'af000000-%';delete from location_private.places where id::text like 'af100000-%' and provenance='Rollback active fixture';commit;")
class Session:
 def __init__(self,name,operation):
  self.p=subprocess.Popen(BASE,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0);self.out=b''
  self.p.stdin.write((f"set application_name='{name}';begin;set local lock_timeout='10s';"+operation+"\n\\echo READY\n").encode());self.p.stdin.flush()
 def ready(self):
  end=time.monotonic()+8;s=selectors.DefaultSelector();s.register(self.p.stdout,selectors.EVENT_READ)
  try:
   while b'READY' not in self.out and time.monotonic()<end:
    for key,_ in s.select(.1):
     data=key.fileobj.read(8192)
     if data:self.out+=data
     elif self.p.poll() is not None:return False
   return b'READY' in self.out
  finally:s.close()
 def finish(self,resolution='commit'):
  if self.p.poll() is None:self.p.stdin.write((resolution+';\n\\q\n').encode());self.p.stdin.flush()
  tail,_=self.p.communicate(timeout=12);self.out+=tail;return self.p.returncode
 def result(self):return next(json.loads(line) for line in self.out.decode().splitlines() if line.startswith('['))
def observe():
 end=time.monotonic()+8
 while time.monotonic()<end:
  if sql("select exists(select 1 from pg_stat_activity l join pg_stat_activity w on w.application_name='active-race-winner' where l.application_name='active-race-loser' and l.wait_event_type='Lock' and w.pid=any(pg_blocking_pids(l.pid)))")=='t':return
 raise AssertionError('No actual lock wait')
assert json.loads(subprocess.check_output(['docker','inspect','--format','{"network":{{json .HostConfig.NetworkMode}},"ports":{{json .NetworkSettings.Ports}}}',CONTAINER]))==dict(network='none',ports={})
assert sql("select exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1')")=='t'
match=actor(A,"select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.get_queue_match() r;")
operations={
 'reverse-block':actor(B,f"select public.block_owner_target('{A}');"),
 'candidate-leave':actor(B,'select public.leave_queue();'),
 'actor-leave':actor(A,'select public.leave_queue();'),
 'discovery':f"update public.detailed_settings set settings=settings||'{{\"friendsDiscovery\":false}}' where user_id='{B}';",
 'filters':f"update public.friends_search_preferences set preferences=preferences||'{{\"ageMin\":99,\"ageMax\":99}}' where user_id='{B}';",
 'catalogue':"update location_private.places set enabled=false where id='af100000-0000-4000-8000-000000000002';",
}
results=[]
for scenario,mutation in operations.items():
 for first in ['match','mutation']:
  for resolution in ['commit','rollback']:
   setup()
   try:
    w=Session('active-race-winner',match if first=='match' else mutation);assert w.ready(),w.out
    l=Session('active-race-loser',mutation if first=='match' else match);observe();assert w.finish(resolution)==0,w.out
    assert l.ready(),l.out;assert l.finish()==0,l.out
    returned=(w if first=='match' else l).result()
    # A committed earlier mutation excludes B, but another real eligible person
    # may be selected if it was visible in the initial snapshot. No B may leak.
    excluded=first=='mutation' and resolution=='commit'
    if excluded:assert all(row['match_profile_id']!=B for row in returned),returned
    else:assert len(returned)==1 and returned[0]['match_profile_id']==B,returned
    results.append(dict(scenario=scenario,first=first,resolution=resolution,waitObserved=True,returned=[r['match_profile_id'] for r in returned]));print('PASS',results[-1],flush=True)
   finally:cleanup()
print(json.dumps(results,indent=2))
