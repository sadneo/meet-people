"""Observed two-session lock races; never targets an existing app database."""
import json, subprocess, time, uuid

def run(check,rpc,sql,root,base,env,database,context):
    ids=context['ids'];command=context['command'];join=context['join'];cycle=context['cycle'];state=context['state']
    def literal(value):return "'"+str(value).replace("'","''")+"'"
    def cmd(action,data):return json.dumps({'action':action,'requestId':str(uuid.uuid4()),'data':data})
    def call(name,args):return 'select public.'+name+'('+','.join(literal(value) for value in args)+')::text;'
    def prefix(actor,service,name):
        role='service_role' if service else 'authenticated'
        return f"set application_name='{name}';begin;set local role {role};select set_config('request.jwt.claim.role','{role}',true);"+(f"select set_config('request.jwt.claim.sub','{actor}',true);" if actor else '')
    def wait(predicate,message):
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if sql(predicate)=='t':return
            time.sleep(.02)
        raise AssertionError(message)
    def race(first_actor,first_call,second_actor,second_call,service=False):
        tag='active-race-'+uuid.uuid4().hex[:8];first=None;second=None
        try:
            first=subprocess.Popen(base+['-d',database],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
            first.stdin.write(prefix(first_actor,service,tag+'-one')+first_call+"select 'race-held';\n");first.stdin.flush()
            wait(f"select exists(select 1 from pg_stat_activity where application_name='{tag}-one' and state='idle in transaction' and query like '%race-held%');",'first transaction did not reach controlled barrier')
            second=subprocess.Popen(base+['-d',database],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
            second.stdin.write(prefix(second_actor,service,tag+'-two')+second_call+'commit;\n');second.stdin.close();second.stdin=None
            wait(f"select exists(select 1 from pg_stat_activity where application_name='{tag}-two' and cardinality(pg_blocking_pids(pid))>0);",'second transaction never observed blocked on first')
            first.stdin.write('commit;\n');first.stdin.close();first.stdin=None
            out1,err1=first.communicate(timeout=5);out2,err2=second.communicate(timeout=5)
            check(first.returncode==0,'first racing transaction committed: '+err1[-300:])
            return second.returncode,out2,err2
        finally:
            for process in [first,second]:
                if process and process.poll() is None:process.kill();process.communicate()
    # Distinct commands from the same actor cannot create two queue entries.
    queue_data={'preferredNewFriends':1,'minimumGroupSize':2,'maximumGroupSize':3,'allowExistingGroups':False}
    code,_,error=race(ids[7],call('active_friends_command',[cmd('join',queue_data)]),ids[7],call('active_friends_command',[cmd('join',queue_data)]))
    check(code!=0 and 'AF409' in error,'concurrent double enrollment conflicts, rather than double assigning')
    check(sql(f"select count(*) from active_friends_private.occupancy where user_id='{ids[7]}';")=='1','one active slot per actor')
    command(8,'cancel');command(4,'cancel');join(4,2);join(5,2)
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    pool=rpc(None,'claim_active_friends_job',service=True)
    selected=subprocess.run(['pnpm','--config.verify-deps-before-run=false','exec','tsx','tests/integration/local/active-select.ts'],input=json.dumps(pool),cwd=root,text=True,capture_output=True,check=True)
    selection=json.loads(selected.stdout)
    finish=call('finish_active_friends_job',[pool['unitId'],pool['leaseToken'],json.dumps(selection)])
    code,_,error=race(None,finish,None,finish,service=True)
    check(code!=0 and 'AF409' in error,'concurrent reservation commits exactly once')
    offer=state(4)['proposal'];check(offer['id']==state(5)['proposal']['id'],'one shared proposal, not duplicate allocations')
    command(4,'accept',{'proposalId':offer['id']})
    before=int(sql('select count(*) from active_friends_private.groups;'))
    # Reverse block wins first: last acceptance waits, then cannot create group.
    code,output,error=race(ids[3],call('block_owner_target',[ids[4]]),ids[4],call('active_friends_command',[cmd('accept',{'proposalId':offer['id']})]))
    check(code==0,'stale acceptance reconciles actual cancelled/queued state: '+error)
    check(int(sql('select count(*) from active_friends_private.groups;'))==before,'block-before-accept prevents formation')
    check(state(5)['state']!='formed','blocked roster is never claimed formed')
    rpc(ids[3],'unblock_owner_target',[ids[4]])
    command(4,'cancel');command(5,'cancel');join(4,2);join(5,2)
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    cycle();offer=state(4)['proposal'];command(4,'accept',{'proposalId':offer['id']})
    code,_,error=race(ids[4],call('active_friends_command',[cmd('accept',{'proposalId':offer['id']})]),ids[3],call('block_owner_target',[ids[4]]))
    check(code==0,'accept-before-block serializes correctly: '+error)
    check(int(sql('select count(*) from active_friends_private.groups;'))==before+1,'acceptance winning lock forms exactly one group')
    print('PASS: observed two-session double-enrollment, reservation replay, block-before-accept and accept-before-block lock races',flush=True)

    # Exercise the maximum roster against real Postgres, not just the CPU scorer.
    for n in range(9,18):join(n,9)
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    check(cycle()['state']=='reserved','full nine-person reservation')
    proposal=state(9)['proposal'];check(len(proposal['members'])==9,'maximum-size roster is feasible')
    sql('update active_friends_private.policy set enabled=false;')
    try:command(9,'accept',{'proposalId':proposal['id']});raise AssertionError('Paused matcher formed group')
    except RuntimeError as error:check('AF503' in str(error),'paused matcher rejects pending acceptance through direct RPC')
    sql('update active_friends_private.policy set enabled=true;')
    durations=[]
    for n in range(9,18):
        started=time.perf_counter();result=command(n,'accept',{'proposalId':proposal['id']});durations.append((time.perf_counter()-started)*1000)
    check(result['state']=='formed','nine-person group forms only after all nine accept')
    check(len(rpc(ids[8],'get_active_friends_group',[result['groupId']])['members'])==9,'no missing or extra members in maximum-size group')
    context['metrics']={'syntheticAccounts':len(ids),'maxGroupSize':9,'acceptanceRpcSamples':len(durations),'acceptanceRpcP50Ms':sorted(durations)[4],'acceptanceRpcMaxMs':max(durations),'limitations':'local psql process + SQL timing; synthetic Auth, Unix socket; not HTTP/production load'}
    print('PASS: real nine-person reservation/formation and bounded acceptance timing',flush=True)
    # A newcomer who accepted a maximum of three must not later be pulled into
    # four through another ready-up cycle, even if the old group's ideal was four.
    join(18,4);join(19,4)
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    cycle();proposal=state(18)['proposal'];command(18,'accept',{'proposalId':proposal['id']})
    limited=command(19,'accept',{'proposalId':proposal['id']})['groupId']
    check(rpc(ids[17],'get_active_friends_group',[limited])['targetSize']==4,'smaller formed group retains original ideal when permitted')
    join(20,3,existing=True);command(18,'ready',{'groupId':limited,'ready':True});command(19,'ready',{'groupId':limited,'ready':True})
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    cycle();proposal=state(20)['proposal']
    for n in [18,19,20]:command(n,'accept',{'proposalId':proposal['id']})
    check(rpc(ids[19],'get_active_friends_group',[limited])['targetSize']==3,'future growth honors every member maximum')

    # Leaving during review invalidates the existing group's consent/roster and
    # releases its newcomer; it must not silently form a smaller different group.
    command(20,'leave',{'groupId':limited})
    sql(f"update public.profiles set birthdate=current_date-interval '24 years' where id='{ids[6]}';")
    join(7,3,existing=True);command(18,'ready',{'groupId':limited,'ready':True});command(19,'ready',{'groupId':limited,'ready':True})
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    cycle();proposal=state(7)['proposal'];command(18,'accept',{'proposalId':proposal['id']});command(7,'accept',{'proposalId':proposal['id']})
    command(19,'leave',{'groupId':limited})
    check(state(7)['state']=='queued','roster change releases newcomer rather than adding without all consent')
    check([m['id'] for m in rpc(ids[17],'get_active_friends_group',[limited])['members']]==[ids[17]],'leaving during review preserves existing conversation without phantom members')
    command(7,'cancel')
    print('PASS: leave during growth review invalidates proposal and preserves newcomer priority',flush=True)
