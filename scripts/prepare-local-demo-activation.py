"""Build a reviewable, atomic local demo SQL bundle. Does not connect/apply SQL."""
from pathlib import Path
import hashlib,json
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
root=Path(__file__).resolve().parent.parent
out="\\set ON_ERROR_STOP on\nbegin;\nset local lock_timeout='3s';\nset local statement_timeout='30s';\n"
out+="""do $$ begin
 if current_database()<>'postgres' or current_user<>'postgres' or to_regclass('auth.users') is null
 or to_regclass('public.account_profiles') is null or to_regnamespace('safety_private') is not null
 or to_regnamespace('photo_private') is not null or to_regnamespace('dating_private') is not null
 then raise exception 'Local demo inventory changed: stop and review' using errcode='22023';end if;
end $$;
"""
manifest=[]
for source in sources:
 data=(root/source).read_text();start=data.index('\nbegin;');end=data.rindex('\ncommit;')
 assert end>start and not data[end+len('\ncommit;'):].strip(),source
 out+='\n-- VERIFIED SOURCE '+source+'\n'+data[:start]+data[start+len('\nbegin;'):end]+'\n'
 manifest.append({'path':source,'sha256':hashlib.sha256(data.encode()).hexdigest()})
out+="\nnotify pgrst,'reload schema';\ncommit;\n"
target=root/'worktree/safety-owner-review/local-demo-activation.sql';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(out)
manifest.append({'bundle':str(target.relative_to(root)),'sha256':hashlib.sha256(out.encode()).hexdigest()})
(root/'worktree/safety-owner-review/local-demo-activation-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Prepared atomic local demo bundle:',len(sources),'sources; SHA256',manifest[-1]['sha256'])
