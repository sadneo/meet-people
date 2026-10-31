"""Synthetic-account lifecycle and concurrency acceptance in a disposable PG.
Called only by run-matching-sql.py with its fresh Unix-only, network-isolated DB.
"""
import json, subprocess, uuid
from pathlib import Path

IDS=[f'ee000000-0000-4000-8000-{n:012}' for n in range(1,21)]
def run(check, rpc, sql, root):
    def rid(): return str(uuid.uuid4())
    def command(n, action, data=None, request=None):
        return rpc(IDS[n-1], 'active_friends_command', [json.dumps({'action':action,'requestId':request or rid(),'data':data or {}})])
    def join(n, size=3, existing=False):
        return command(n,'join',{'preferredNewFriends':size-1,'minimumGroupSize':2,'maximumGroupSize':max(3,size),'allowExistingGroups':existing})
    def state(n): return rpc(IDS[n-1],'get_active_friends_status')
    def cycle():
        rpc(None,'sweep_active_friends',service=True)
        pool=rpc(None,'claim_active_friends_job',service=True)
        if pool is None: return None
        selected=subprocess.run(['pnpm','--config.verify-deps-before-run=false','exec','tsx','tests/integration/local/active-select.ts'],input=json.dumps(pool),cwd=root,text=True,capture_output=True,check=True)
        selection=json.loads(selected.stdout)
        return rpc(None,'finish_active_friends_job',[pool['unitId'],pool['leaseToken'],json.dumps(selection)],service=True)
    sql('''create table public.safety_owner_disposable_marker(singleton boolean primary key,purpose text);
    insert into public.safety_owner_disposable_marker values(true,'network-none-safety-owner-v1');
    update active_friends_private.policy set enabled=true;''')
    for n,person in enumerate(IDS,1):
        sql(f"""insert into auth.users(id) values('{person}');
        insert into public.profiles(id,username,display_name,birthdate,location_city) values('{person}','active-fixture-{n}','Active {n}',current_date-interval '24 years','Active campus');
        insert into public.account_settings(user_id,preferences,settings,completed) values('{person}',
        '{{"distance":"Nearby","group":"Either","intents":["Activity partners"],"usual":[]}}',
        '{{"notifications":false,"availability":false,"discoverable":false,"location":false}}','[]');
        insert into public.user_interests(profile_id,text) select '{person}',x||' {n}' from unnest(array['Custom carving','Night walks','Niche games']) x;
        insert into public.availability(profile_id,dow,start_time,end_time) select '{person}',dow,'00:00','24:00' from generate_series(0,6) dow;""")
    sql("""set role pebble_location_catalog_publisher;
    select public.publish_search_location_place('{"id":"ee100000-0000-4000-8000-000000000001","label":"Active campus","region":"Synthetic","aliases":["Active campus"],"latitude":0,"longitude":0,"provenance":"Isolated test","verifiedUntil":"2099-01-01T00:00:00Z","enabled":true}');reset role;""")
    for n,person in enumerate(IDS,1):
        receipt=rpc(person,'resolve_search_area',[json.dumps({'requestId':rid(),'mode':'friends','source':'home','placeId':'ee100000-0000-4000-8000-000000000001'})])
        rpc(person,'save_friends_search_preferences',[json.dumps({'expectedRevision':0,'preferences':{'ageMin':18,'ageMax':99,'radiusMiles':10,'goals':[],'searchArea':{'source':'home','resolvedLocationRef':receipt['id']}}})])
        rpc(person,'save_matching_scoring_settings',[json.dumps({'expectedRevision':0,'timeZone':'UTC','showAvailability':False})])
    check(state(1)['state']=='idle','new queue is idle')
    token=rid();payload={'preferredNewFriends':2,'minimumGroupSize':2,'maximumGroupSize':3,'allowExistingGroups':False}
    a=command(1,'join',payload,token);b=command(1,'join',payload,token)
    check(a['entryId']==b['entryId'],'queue retry is idempotent')
    for n in [2,3]:join(n)
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds';")
    check(cycle()['state']=='reserved','unrelated interests and all passive/Dating toggles off still form a proposal')
    proposal=state(1)['proposal'];old=proposal['id']
    check(len(proposal['members'])==3 and proposal['commonWindow'] is None,'private availability stays hidden')
    check(command(1,'accept',{'proposalId':old})['state']=='accepted','one acceptance does not form group')
    command(2,'accept',{'proposalId':old})
    smaller=command(1,'smaller',{'proposalId':old,'memberIds':IDS[:2]})['proposal']
    check(smaller['id']!=old and all(m['response']=='pending' for m in smaller['members']),'smaller roster resets EVERY acceptance')
    check(command(1,'accept',{'proposalId':smaller['id']})['state']=='accepted','smaller roster still requires second acceptance')
    formed=command(2,'accept',{'proposalId':smaller['id']});group=formed['groupId']
    check(formed['state']=='formed' and group is not None,'all exact-roster members form one group')
    check(state(3)['state']=='queued','excluded pending person keeps queue priority')
    check(len(rpc(IDS[0],'get_active_friends_group',[group])['members'])==2,'only accepted final members are in chat')
    msg=rpc(IDS[0],'active_friends_send',[group,'Before newcomer joins',rid()])
    command(3,'cancel');join(3,existing=True)
    command(1,'ready',{'groupId':group,'ready':True})
    check(rpc(IDS[0],'get_active_friends_group',[group])['searchState']=='readying','one ready member cannot queue whole group')
    command(2,'ready',{'groupId':group,'ready':True})
    check(rpc(IDS[0],'get_active_friends_group',[group])['searchState']=='queued','all members ready queues group as a unit')
    command(1,'ready',{'groupId':group,'ready':False})
    check(rpc(IDS[0],'get_active_friends_group',[group])['searchState']=='idle','withdrawn readiness cancels growth without deleting chat')
    command(1,'ready',{'groupId':group,'ready':True});command(2,'ready',{'groupId':group,'ready':True})
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    check(cycle()['state']=='reserved','existing group can grow with opted-in newcomer')
    growing=state(3)['proposal'];check(growing['groupId']==group and len(growing['members'])==3,'newcomer reviews existing roster')
    command(1,'accept',{'proposalId':growing['id']});command(2,'accept',{'proposalId':growing['id']})
    check(command(3,'accept',{'proposalId':growing['id']})['groupId']==group,'growth preserves conversation identity')
    check(rpc(IDS[2],'active_friends_history',[group])['messages']==[],'newcomer cannot read earlier messages')
    request=rid();after=rpc(IDS[1],'active_friends_send',[group,'After joining',request])
    check(rpc(IDS[1],'active_friends_send',[group,'After joining',request])['id']==after['id'],'message retries deduplicate')
    check([m['id'] for m in rpc(IDS[2],'active_friends_history',[group])['messages']]==[after['id']],'join boundary is enforced')
    check(len(rpc(IDS[0],'active_friends_history',[group])['messages'])==2,'existing members keep their history')
    rpc(IDS[0],'block_owner_target',[IDS[2]])
    rpc(IDS[2],'active_friends_send',[group,'Blocked sender',rid()])
    check(len(rpc(IDS[0],'active_friends_history',[group])['messages'])==2,'blocked sender messages suppressed without destroying chat')
    check(len(rpc(IDS[1],'active_friends_history',[group])['messages'])==3,'other members can continue chatting')
    command(3,'leave',{'groupId':group})
    check(len(rpc(IDS[0],'get_active_friends_group',[group])['members'])==2,'explicit leave updates roster')
    # Expiry does not call a timeout a decline, does not repeatedly reserve offline
    # nonresponders, and keeps accepted members' original FIFO priority.
    for n in [4,5,6]:join(n)
    sql("update active_friends_private.units set queued_at=clock_timestamp()-interval '45 seconds' where state='queued';")
    check(cycle()['state']=='reserved','second independent proposal')
    offer=state(4)['proposal'];queued=state(4)['queuedAt'];command(4,'accept',{'proposalId':offer['id']})
    sql(f"update active_friends_private.proposals set expires_at=clock_timestamp()-interval '1 second' where id='{offer['id']}';")
    rpc(None,'sweep_active_friends',service=True)
    check(state(4)['state']=='queued' and state(4)['queuedAt']==queued,'accepted member keeps priority after others time out')
    check(state(5)['state']=='expired' and state(6)['state']=='expired','unresponsive members are expired, not falsely declined')
    try:command(5,'accept',{'proposalId':offer['id']});raise AssertionError('Expired offer accepted')
    except RuntimeError as error:check('AF409' in str(error),'late acceptance cannot revive expired roster')
    sql(f"update public.profiles set birthdate=current_date-interval '17 years' where id='{IDS[6]}';")
    try:join(7);raise AssertionError('Minor joined')
    except RuntimeError as error:check('AF409' in str(error),'under-18 manual queue rejected')
    sql('update active_friends_private.policy set enabled=false;')
    check(len(rpc(IDS[0],'active_friends_history',[group])['messages'])==2,'pausing matcher preserves established chat history')
    try:join(8);raise AssertionError('Paused matcher enrolled user')
    except RuntimeError as error:check('AF503' in str(error),'database activation gate blocks direct RPC enrollment')
    sql('update active_friends_private.policy set enabled=true;')
    check('latitude' not in json.dumps(state(4)) and 'goals' not in json.dumps(state(4)),'private pool fields absent from public status')
    print('PASS: queue-first groups, unrelated interests, independent opt-ins, exact smaller-roster consent, growth readiness, private history boundaries, block suppression, expiry, idempotency and age policy',flush=True)
    return {'ids':IDS,'group':group,'command':command,'cycle':cycle,'state':state,'join':join}
