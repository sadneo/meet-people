"""Build a reviewable, atomic local demo SQL bundle. Does not connect/apply SQL."""
from pathlib import Path
import argparse,hashlib,json
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--uuid-messaging',action='store_true',help='Use actor adapters for the installed native UUID messaging schema')
parser.add_argument('--matching-upgrade',action='store_true',help='Prepare only the new canonical matching migrations for an already activated local backend')
options=parser.parse_args()
sources=[
 'docs/dev-account-reconciliation.sql','docs/profile-details-migration.sql',
 'docs/detailed-settings-migration.sql','docs/safety-contact-guards-migration.sql',
 'docs/safety-owner-contact-migration.sql','docs/social-contact-migration.sql',
 'docs/discovery-privacy-migration.sql','docs/friends-search-preferences-migration.sql',
 'docs/dating-aggregate-migration.sql','docs/search-location-migration.sql',
 'docs/active-nearby-migration.sql','docs/profile-photo-migration.sql',
 'docs/dating-live-migration.sql','docs/real-account-boundary.sql',
 'docs/friends-runtime-migration.sql',
]
if options.uuid_messaging:
 sources[3:6]=['docs/uuid-safety-owner-migration.sql','docs/uuid-social-contact-migration.sql']
root=Path(__file__).resolve().parent.parent
if options.matching_upgrade:
 sources=[str(p.relative_to(root)) for p in sorted((root/'supabase/migrations').glob('*.sql')) if p.name[:8] in ('20261028','20261029','20261030')]
 if options.uuid_messaging:sources.append('docs/uuid-relationship-mode-projection.sql')
out="\\set ON_ERROR_STOP on\nbegin;\nset local lock_timeout='3s';\nset local statement_timeout='30s';\n"
out+="""do $$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or to_regclass('auth.users') is null
 or to_regclass('public.account_profiles') is null or to_regnamespace('safety_private') is not null
 or to_regnamespace('photo_private') is not null or to_regnamespace('dating_private') is not null
 then raise exception 'Local demo inventory changed: stop and review' using errcode='22023';end if;
end $$;
"""
manifest=[]
if options.matching_upgrade:
 out="\\set ON_ERROR_STOP on\nbegin;\nset local lock_timeout='3s';\nset local statement_timeout='60s';\n"
 out+="""do $$ begin
 if current_database()<>'postgres' or current_user<>'postgres'
 or to_regnamespace('safety_private') is null or to_regnamespace('social_private') is null
 or to_regnamespace('dating_private') is null or to_regnamespace('location_private') is null
 or to_regnamespace('matching_private') is not null
 then raise exception 'Local matching upgrade inventory changed: stop and review' using errcode='22023';end if;
end $$;
"""
 out+="do $$ begin if not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis' and n.nspname='extensions') then raise exception 'Canonical PostGIS namespace required: stop and review';end if;end $$;\n"
for source in sources:
 data=(root/source).read_text();start=data.index('\nbegin;');end=data.rindex('\ncommit;')
 assert end>start and not data[end+len('\ncommit;'):].strip(),source
 out+='\n-- VERIFIED SOURCE '+source+'\n'+data[:start]+data[start+len('\nbegin;'):end]+'\n'
 manifest.append({'path':source,'sha256':hashlib.sha256(data.encode()).hexdigest()})
out+="\nnotify pgrst,'reload schema';\ncommit;\n"
stem='local-uuid-activation' if options.uuid_messaging else 'local-demo-activation'
if options.matching_upgrade:stem='local-uuid-matching-upgrade' if options.uuid_messaging else 'local-matching-upgrade'
target=root/f'worktree/safety-owner-review/{stem}.sql';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(out)
manifest.append({'bundle':str(target.relative_to(root)),'sha256':hashlib.sha256(out.encode()).hexdigest()})
(root/f'worktree/safety-owner-review/{stem}-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Prepared atomic local demo bundle:',len(sources),'sources; SHA256',manifest[-1]['sha256'])
