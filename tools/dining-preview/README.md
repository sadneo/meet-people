# Temporary dining menu viewer

Start with `pnpm dining:preview`, then open http://127.0.0.1:5175.
Use `pnpm dining:preview --port 5176` if that port is occupied.

Click **Fetch fresh menus** to run both scrapers in full, read-only mode. The
viewer caches their real JSON output in this folder's ignored `.cache/` directory
so reloads and restarts do not scrape again. It requires no Supabase environment,
credentials, migration, or database writes. Failed refreshes keep the last good
source snapshot and display source errors.

Filter by source, location, date, menu, or dish/ingredient/label text. Expand a dish
for ingredients, serving size, and nutrition when the source supplies them.
**Download JSON** exports both loaded datasets. The server listens on loopback
only and serves just this viewer and its public menu data.

To remove the test website later: delete `tools/dining-preview/` and remove the
`dining:preview` script from `package.json`. The scrapers remain independent.
