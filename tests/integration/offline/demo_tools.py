"""Exercise the actual generated demo SQL only inside the runner's disposable DB."""
import subprocess,json,getpass

def run(check,sql,root,database):
    fixture=json.loads(subprocess.run(['pnpm','--config.verify-deps-before-run=false','exec','tsx','tests/integration/local/demo-sql.ts'],cwd=root,text=True,capture_output=True,check=True).stdout)
    # The CLI deliberately requires postgres/postgres. This isolated harness uses
    # a dedicated database and OS role; adapt ONLY that local operator assertion.
    def execute(source):
        return sql(source.replace("current_user<>'postgres'", "current_user<>'"+getpass.getuser()+"'").replace("current_database()<>'postgres'", "current_database()<>'"+database+"'"))
    sql("alter table auth.users add column email text,add column raw_app_meta_data jsonb;")
    for p in fixture['profiles']:
        sql(f"insert into auth.users(id,email,raw_app_meta_data) values('{p['id']}','{p['email']}','{{\"pebble_demo_seed\":\"pebble-local-demo-v1\"}}');")
    sql("""set role pebble_location_catalog_publisher;select public.publish_search_location_place('{"id":"b641ad29-9f92-4e66-9490-0b616f8fd85c","label":"Stony Brook University","region":"Synthetic","aliases":["Stony Brook University"],"latitude":0,"longitude":0,"provenance":"Isolated test","verifiedUntil":"2099-01-01T00:00:00Z","enabled":true}');reset role;""")
    execute(fixture['seed'])
    ids=','.join("'"+p['id']+"'" for p in fixture['profiles'])
    check(sql(f"select count(*) from matching_private.scoring_settings where user_id in ({ids}) and time_zone='America/New_York';")=='3','demo seed saves actual canonical schedule timezone')
    execute(fixture['join'])
    check(sql(f"select count(*) from active_friends_private.occupancy where user_id in ({ids});")=='3','demo active command enrolls exactly selected accounts')
    check(execute(fixture['status']).count('"state": "queued"')==3,'demo status returns actual new queue')
    execute(fixture['cancel'])
    check(sql(f"select count(*) from active_friends_private.occupancy where user_id in ({ids});")=='0','demo cancellation releases selected accounts')
    execute(fixture['join'])
    first=fixture['profiles'][0]['id']
    sql(f"update auth.users set raw_app_meta_data='{{}}' where id='{first}';")
    try:execute(fixture['remove'])
    except RuntimeError:pass
    else:raise AssertionError('Unmarked account deletion must fail')
    check(sql(f"select count(*) from auth.users where id in ({ids});")=='3','remove validates all markers before deleting anyone')
    sql(f"update auth.users set raw_app_meta_data='{{\"pebble_demo_seed\":\"pebble-local-demo-v1\"}}' where id='{first}';")
    execute(fixture['remove'])
    check(sql(f"select count(*) from auth.users where id in ({ids});")=='0','remove deletes only seed-owned fictional accounts')
    check(sql(f"select count(*) from active_friends_private.occupancy where user_id in ({ids});")=='0','removing queued demos releases their occupancy')
    print('PASS: actual demo seed, active queue/status/cancel, guarded removal and ownership rollback',flush=True)
