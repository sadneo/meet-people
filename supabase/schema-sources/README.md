# Schema sources

Active SQL inputs for product deployment, migration generation, isolated acceptance
tests, and local demo setup live here. Historical SQL proposals live in
`supabase/candidates/`; diagnostic queries live in `supabase/snippets/`. Neither
directory is a product deployment input. SQL acceptance tests live in
`tests/integration/sql/`.

## Product schema

`scripts/product-schema.mjs` defines the source order and the legacy/UUID adapters.
It builds the deployment bundle used by `scripts/deploy-product-schema.mjs` and
the two migration snapshots written by `scripts/generate-product-migrations.mjs`:

- `supabase/migrations/20261027000000_product_prerequisites.sql`
- `supabase/migrations/20261029000150_uuid_relationship_projection.sql`

Verify that the snapshots match their sources:

```sh
pnpm test:unit tests/unit/product-migrations.test.ts
```

Generated SQL retains the historical `docs/` source labels because those comments
are included in installed `source_hash` values. The files now live here; the labels
are stable deployment identifiers, not filesystem paths. Moving the sources must
not change their contents, generated migrations, or installed hashes.

For intentional schema changes, add a forward migration for installed databases.
Do not rewrite applied migration history or regenerate snapshots merely to rename
their embedded source labels. To reproduce snapshots from reviewed sources, run
`node scripts/generate-product-migrations.mjs` and inspect the diff.

## Local-only setup

- `local-event-group-matching.sql` is loaded by `scripts/run-local-event-groups.ts`
  and the offline demo acceptance harness.
- `stony-brook-demo-location.sql` is loaded by `scripts/seed-local-demo.ts` when
  location refresh is requested.

These local-only files are not part of the product migration bundle. See
[`docs/local-backend-activation.md`](../../docs/local-backend-activation.md) and
[`docs/demo-data.md`](../../docs/demo-data.md) for setup prerequisites.
