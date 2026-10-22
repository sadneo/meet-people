"""Real two-session active-result safety; fixed offline target, synthetic fixtures.
No live Auth/PostgREST claim. Every case observes actual blocking, not a timed sleep.
"""
import json, selectors, subprocess, time
from pathlib import Path
CONTAINER='pebble-sprint-review-20261019'
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
  if sql("select exists(select 1 from pg_stat_activity l join pg_stat_activity w on w.application_name='photo-race-winner' where l.application_name='photo-race-loser' and l.wait_event_type='Lock' and w.pid=any(pg_blocking_pids(l.pid)))")=='t':return
 raise AssertionError('No actual lock wait')
assert json.loads(subprocess.check_output(['docker','inspect','--format','{"network":{{json .HostConfig.NetworkMode}},"ports":{{json .NetworkSettings.Ports}}}',CONTAINER]))==dict(network='none',ports={})
assert sql("select exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1')")=='t'
jpeg=subprocess.check_output(['pnpm','--config.verify-deps-before-run=false','exec','node','--input-type=module','-e',"import sharp from 'sharp';process.stdout.write((await sharp({create:{width:2,height:2,channels:3,background:'#dfcbbd'}}).jpeg({progressive:false}).toBuffer()).toString('base64'))"],text=True).strip()
def save(key,body):return actor(B,"select public.save_profile_photo("+"'"+json.dumps(dict(expectedRevision=1,requestId=key,jpegBase64=body))+"'::jsonb);")
read=actor(A,f"select public.read_profile_photo('{B}',1);")
results=[]
for scenario in ['block','remove','cas']:
 for first in (['read','mutation'] if scenario!='cas' else ['write']):
  for resolution in ['commit','rollback']:
   setup()
   try:
    sql('begin;'+actor(B,"select public.save_profile_photo('"+json.dumps(dict(expectedRevision=0,requestId='af400000-0000-4000-8000-000000000001',jpegBase64=jpeg))+"'::jsonb);")+'commit;')
    mutation=actor(B,f"select public.block_owner_target('{A}');") if scenario=='block' else save('af400000-0000-4000-8000-000000000002',None)
    if scenario=='cas':
     op1=save('af400000-0000-4000-8000-000000000002',jpeg);op2=save('af400000-0000-4000-8000-000000000003',None)
    else:op1=read if first=='read' else mutation;op2=mutation if first=='read' else read
    w=Session('photo-race-winner',op1);assert w.ready(),w.out
    l=Session('photo-race-loser',op2);observe();assert w.finish(resolution)==0,w.out
    excluded=(scenario=='cas' or first=='mutation') and resolution=='commit'
    expected='PH409' if scenario=='cas' else 'PT404'
    if excluded:
     assert not l.ready(),l.out;assert l.finish()!=0 and expected.encode() in l.out and b'40P01' not in l.out,l.out
    else:assert l.ready(),l.out;assert l.finish()==0,l.out
    if scenario=='cas':assert sql(f"select jpeg is null from photo_private.photos where user_id='{B}'")==('f' if resolution=='commit' else 't')
    results.append(dict(scenario=scenario,first=first,resolution=resolution,waitObserved=True,result=expected if excluded else 'committed'));print('PASS',results[-1],flush=True)
   finally:cleanup()
print(json.dumps(results,indent=2))
