"""Start a local Supabase profile for the canonical matchmaking backend.
Keeps historical migration files unchanged. Never resets a database.
"""
from pathlib import Path
import re,shutil,subprocess,runpy
root=Path(__file__).resolve().parents[1]
target=root/'worktree/local-matchmaking'
(target/'supabase/migrations').mkdir(parents=True,exist_ok=True)
# The canonical product SQL intentionally retains the original bigint messaging
# model. These two later service-backed replacements are a different schema track.
excluded={'20261013125000_messaging.sql','20261013130000_connection_requests.sql'}
for source in sorted((root/'supabase/migrations').glob('*.sql')):
    if source.name not in excluded:shutil.copyfile(source,target/'supabase/migrations'/source.name)
# Build the exact same prerequisite sequence used in canonical SQL acceptance.
sources=runpy.run_path(str(root/'tests/integration/offline/matching_sources.py'))['SOURCES']
reviewed=[p for p in sources if p.startswith('docs/')]
bundle="begin;\nset local lock_timeout='3s';\nset local statement_timeout='60s';\n"
for path in reviewed:
    source=(root/path).read_text();start=source.index('\nbegin;');end=source.rindex('\ncommit;')
    bundle+='\n-- SOURCE: '+path+'\n'+source[start+len('\nbegin;'):end]+'\n'
bundle+="\ngrant pebble_location_catalog_publisher to postgres;\nnotify pgrst,'reload schema';\ncommit;\n"
(target/'supabase/migrations/20261027000000_reconciled_product.sql').write_text(bundle)
config=(root/'supabase/config.toml').read_text()
config=re.sub(r'(\[db.seed\][^[]*?)enabled = true',r'\1enabled = false',config)
(target/'supabase/config.toml').write_text(config)
functions=target/'supabase/functions'
if not functions.exists():functions.symlink_to(root/'supabase/functions',target_is_directory=True)
print('Starting canonical local matchmaking profile (no reset; no legacy seed).',flush=True)
raise SystemExit(subprocess.call(['pnpm','exec','supabase','--workdir',str(target),'start'],cwd=root))
