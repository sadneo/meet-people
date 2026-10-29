#!/usr/bin/env python3
"""Run matching migrations against a fresh, network-isolated Unix-only PG.
Requires local PostgreSQL/PostGIS binaries and Linux unprivileged user namespaces.
Never reads application credentials/env files or connects to an existing server.
"""
import argparse, getpass, json, os, pathlib, re, shutil, subprocess, tempfile, sys
sys.dont_write_bytecode=True
from matching_sources import SOURCES
from active_friends_acceptance import run as acceptance
from active_friends_races import run as races
from demo_tools import run as demo_tools

ROOT=pathlib.Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--pg-bin',required=True,type=pathlib.Path)
parser.add_argument('--pg-lib',type=pathlib.Path)
parser.add_argument('--keep',action='store_true')
args=parser.parse_args()
pg=args.pg_bin.resolve();lib=(args.pg_lib or pg.parent/'lib').resolve()
for name in ['postgres','initdb','pg_ctl','psql']:
    if not (pg/name).is_file():parser.error('Missing PostgreSQL binary '+name)
work=pathlib.Path(tempfile.mkdtemp(prefix='pebble-matching-acceptance-'));socket=work/'socket';socket.mkdir(mode=0o700)
env={key:value for key,value in os.environ.items() if not key.startswith('PG')}
env.update({'LD_LIBRARY_PATH':str(lib),'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null'})
port='65437';database='pebble_safety_owner_disposable';started=False
base=[str(pg/'psql'),'-X','-qAt','-h',str(socket),'-p',port,'-U',getpass.getuser(),'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
def sql(source,db=database):
    result=subprocess.run(base+['-d',db],input=source,text=True,capture_output=True,env=env,cwd=ROOT)
    if result.returncode:raise RuntimeError(result.stderr[-6000:])
    return result.stdout.strip()
def literal(value):return 'null' if value is None else "'"+str(value).replace("'","''")+"'"
def rpc(actor,name,values=(),service=False):
    assert re.fullmatch('[a-z_]+',name)
    role='service_role' if service else 'authenticated'
    source=f"begin;set local role {role};select set_config('request.jwt.claim.role','{role}',true);"
    if actor:source+=f"select set_config('request.jwt.claim.sub',{literal(actor)},true);"
    source+=f"select public.{name}({','.join(literal(value) for value in values)})::text;commit;"
    output=sql(source).splitlines()
    return json.loads(output[-1]) if output and output[-1] not in [role,actor] else None
checks=0
def check(value,message):
    global checks
    assert value,message
    checks+=1
try:
    subprocess.run([str(pg/'initdb'),'-D',str(work/'data'),'-A','trust','--no-locale','--encoding=UTF8'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
    # Positional shell args prevent interpolation of paths into shell code.
    command=['unshare','--user','--map-current-user','--net','sh','-c','readlink /proc/self/ns/net > "$1"; shift; exec "$@"','sh',str(work/'network-namespace'),
             str(pg/'pg_ctl'),'-D',str(work/'data'),'-l',str(work/'postgres.log'),'-o',f"-k {socket} -p {port} -c listen_addresses=''",'start']
    subprocess.run(command,env=env,capture_output=True,text=True,check=True);started=True
    check((work/'network-namespace').read_text().strip()!=os.readlink('/proc/self/ns/net'),'server must run in separate network namespace')
    sql(f'create database {database};','postgres')
    sql('''create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;grant usage on schema auth to public;
    create table auth.users(id uuid primary key,is_anonymous boolean not null default false,banned_until timestamptz,deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create schema extensions;create extension postgis with schema extensions;create extension pgcrypto with schema extensions;''')
    for path in SOURCES:
        source=(ROOT/path).read_text()
        if path.endswith('init_schema.sql'):source=source[source.index('create table profiles'):]
        if path.endswith('embeddings.sql'):
            source=source[:source.index('-- CALL EDGE FUNCTION')]+"\ncreate function get_gemini_embedding(interest_text text) returns double precision[] language plpgsql as $$ begin raise exception 'Offline provider unavailable';end $$;\n"+source[source.index('create or replace function user_interests_embed()'):]
        try:sql(source)
        except RuntimeError as error:raise RuntimeError(f'Migration failed: {path}\n{error}') from error
    print('PASS: all historical/reconciled and new matching migrations installed with real PostGIS; synthetic Auth/provider boundary',flush=True)
    context=acceptance(check,rpc,sql,ROOT)
    races(check,rpc,sql,ROOT,base,env,database,context)
    for acceptance_path in ['tests/integration/sql/dating-rules.sql','tests/integration/sql/friends-discovery.sql']:
        sql("set pebble.safety_owner_test_target='network-none-safety-owner-v1';\n"+(ROOT/acceptance_path).read_text())
        print('PASS:',acceptance_path,flush=True)
    demo_tools(check,sql,ROOT,database)
    before_groups=sql('select count(*) from active_friends_private.groups;')
    before_messages=sql('select count(*) from active_friends_private.messages;')
    sql("update active_friends_private.proposals set closed_at=clock_timestamp()-interval '40 days' where state<>'reserved';update active_friends_private.units set finished_at=clock_timestamp()-interval '40 days' where state not in('queued','reserved');update active_friends_private.commands set created_at=clock_timestamp()-interval '40 days';select active_friends_private.maintenance();")
    check(sql('select count(*) from active_friends_private.groups;')==before_groups and sql('select count(*) from active_friends_private.messages;')==before_messages,'operational retention never deletes groups or message history')
    check(sql('select count(*) from active_friends_private.commands;')=='0','expired idempotency metadata is purged')
    print('PASS: operational retention preserves existing conversations',flush=True)
    print(json.dumps({'checks':checks,'metrics':context.get('metrics'),'database':'fresh disposable','network':'isolated namespace; Unix socket only','postgres':sql('select version()'),'postgis':sql('select extensions.postgis_version()')}),flush=True)
finally:
    if started:subprocess.run([str(pg/'pg_ctl'),'-D',str(work/'data'),'stop','-m','immediate'],env=env,capture_output=True)
    if args.keep:print('Retained test artifacts:',work)
    else:shutil.rmtree(work)
