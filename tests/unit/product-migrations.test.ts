// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { buildProductSchema, buildProductPrerequisitesMigration, buildUuidRelationshipProjectionMigration } from '../../scripts/product-schema.mjs'

it('keeps migration snapshots in sync with the reviewed prerequisite sources', () => {
  expect(readFileSync('supabase/migrations/20261027000000_product_prerequisites.sql', 'utf8')).toBe(buildProductPrerequisitesMigration())
  expect(readFileSync('supabase/migrations/20261029000150_uuid_relationship_projection.sql', 'utf8')).toBe(buildUuidRelationshipProjectionMigration())
})

it('uses native UUID adapters without the empty-store legacy conversion', () => {
  const native = buildProductSchema('uuid'), legacy = buildProductSchema()
  expect(native.version).toBe('canonical-product-uuid-v1')
  expect(native.sql).toContain('-- docs/uuid-safety-owner-migration.sql')
  expect(native.sql).toContain('-- docs/uuid-social-contact-migration.sql')
  expect(native.sql).not.toContain('create schema messaging_archive')
  expect(legacy.version).toBe('canonical-product-v1')
  expect(legacy.sql).toContain('create schema messaging_archive')
})
