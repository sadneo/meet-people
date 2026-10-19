"""Explicit network-none PostgreSQL concurrency acceptance; synthetic fixtures only.
Run: python3 tests/offline/search-location-races.py
No app database, env files, provider, or elapsed-time-as-lock-proof fallback.
"""
import json, selectors, subprocess, time

CONTAINER = 'pebble-safety-review-20261019-fresh'
BASE = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', 'pebble_safety_owner_disposable']
A = 'be000000-0000-4000-8000-000000000001'
PLACE = 'be000000-0000-4000-8000-000000000002'
KEY = 'be000000-0000-4000-8000-000000000003'

def sql(source):
    result = subprocess.run(BASE, input=source, text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def actor(source):
    return f"set local role authenticated;set local request.jwt.claim.sub='{A}';{source}"

def resolve(key=KEY):
    payload = json.dumps(dict(requestId=key, mode='friends', source='home', placeId=PLACE))
    return f"select public.resolve_search_area({literal(payload)}::jsonb);"

def setup():
    sql(f"""begin;do $$ begin
      if exists(select 1 from auth.users where id='{A}') or exists(select 1 from location_private.places where id='{PLACE}') then raise exception 'Fixture occupied';end if;
      end $$;
      insert into auth.users values('{A}');
      insert into public.profiles(id,username,display_name,birthdate,location_city) values('{A}','offline-location-race','Synthetic race','2000-01-01','Synthetic race campus');
      insert into public.account_settings(user_id,preferences,settings,completed) values('{A}','{{"distance":"Nearby","group":"Either","intents":[],"usual":[]}}','{{"notifications":false,"availability":false,"discoverable":false,"location":true}}','[]');
      set local role pebble_location_catalog_publisher;
      select public.publish_search_location_place(jsonb_build_object('id','{PLACE}','label','Synthetic race campus','region','Synthetic','aliases',jsonb_build_array('Synthetic race campus'),'latitude',0,'longitude',0,'provenance','Offline race fixture','verifiedUntil',to_char(statement_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.USOF'),'enabled',true));commit;""")

def cleanup():
    sql(f"""begin;do $$ begin if exists(select 1 from public.profiles where id='{A}' and username<>'offline-location-race') then raise exception 'Unknown fixture';end if;end $$;
     delete from auth.users where id='{A}';delete from location_private.places where id='{PLACE}' and provenance='Offline race fixture';commit;""")

class Session:
    def __init__(self, name, operation):
        self.p = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0)
        self.out = b''
        self.p.stdin.write((f"set application_name='{name}';begin;set local lock_timeout='10s';" + operation + "\n\\echo READY\n").encode())
        self.p.stdin.flush()
    def ready(self):
        end = time.monotonic() + 8
        selector = selectors.DefaultSelector(); selector.register(self.p.stdout, selectors.EVENT_READ)
        try:
            while b'READY' not in self.out and time.monotonic() < end:
                for key, _ in selector.select(.1):
                    data = key.fileobj.read(8192)
                    if data: self.out += data
                    elif self.p.poll() is not None: return False
            return b'READY' in self.out
        finally: selector.close()
    def finish(self, resolution='commit'):
        if self.p.poll() is None:
            self.p.stdin.write((resolution+';\n\\q\n').encode());self.p.stdin.flush()
        tail, _ = self.p.communicate(timeout=12); self.out += tail
        return self.p.returncode

def observe():
    end = time.monotonic()+8
    while time.monotonic()<end:
        if sql("select exists(select 1 from pg_stat_activity l join pg_stat_activity w on w.application_name='location-race-winner' where l.application_name='location-race-loser' and l.wait_event_type='Lock' and w.pid=any(pg_blocking_pids(l.pid)))") == 't': return
    raise AssertionError('No actual lock wait observed')

inspection = json.loads(subprocess.check_output(['docker','inspect','--format','{"network":{{json .HostConfig.NetworkMode}},"ports":{{json .NetworkSettings.Ports}}}',CONTAINER]))
assert inspection == dict(network='none', ports={})
assert sql("select exists(select 1 from public.safety_owner_disposable_marker where singleton and purpose='network-none-safety-owner-v1')") == 't'
results=[]
for scenario in ['replay','quota','catalogue','home','device']:
    for resolution in ['commit','rollback']:
        setup()
        try:
            first=actor(resolve()); second=actor(resolve()); expected=None
            if scenario=='quota':
                for i in range(9): sql('begin;'+actor(resolve(f'be000000-0000-4000-8000-{100+i:012d}'))+'commit;')
                second=actor(resolve('be000000-0000-4000-8000-000000000004'))
                expected='LC429' if resolution=='commit' else None
            if scenario=='catalogue':
                first=f"update location_private.places set enabled=false where id='{PLACE}';"
                expected='LC409' if resolution=='commit' else None
            if scenario=='home':
                first=f"update public.profiles set location_city='Changed home' where id='{A}';"
                expected='LC409' if resolution=='commit' else None
            if scenario=='device':
                first=f"update public.account_settings set settings=settings||'{{\"location\":false}}' where user_id='{A}';"
                second=actor("select public.issue_browser_search_location(jsonb_build_object('requestId','"+KEY+"','mode','friends','latitude',0,'longitude',0,'accuracyMeters',20,'observedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'),'consent',true));")
                expected='LC403' if resolution=='commit' else None
            winner=Session('location-race-winner',first); assert winner.ready(),winner.out
            loser=Session('location-race-loser',second)
            observe();assert winner.finish(resolution)==0,winner.out
            if expected:
                assert not loser.ready(),loser.out
                assert loser.finish()!=0 and expected.encode() in loser.out and b'40P01' not in loser.out,loser.out
            else:
                assert loser.ready(),loser.out
                assert loser.finish()==0,loser.out
            count=int(sql(f"select count(*) from location_private.requests where actor_id='{A}'"))
            assert count == (10 if scenario=='quota' else (0 if expected else 1)),(scenario,count)
            results.append(dict(scenario=scenario,resolution=resolution,waitObserved=True,result=expected or 'committed',requests=count))
            print('PASS',results[-1],flush=True)
        finally: cleanup()
print(json.dumps(results,indent=2))
