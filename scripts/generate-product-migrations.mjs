import { writeFileSync } from 'node:fs'
import { buildProductPrerequisitesMigration, buildUuidRelationshipProjectionMigration } from './product-schema.mjs'

writeFileSync(new URL('../supabase/migrations/20261027000000_product_prerequisites.sql', import.meta.url), buildProductPrerequisitesMigration())
writeFileSync(new URL('../supabase/migrations/20261029000150_uuid_relationship_projection.sql', import.meta.url), buildUuidRelationshipProjectionMigration())
