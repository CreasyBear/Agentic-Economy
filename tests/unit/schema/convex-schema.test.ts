import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import schema from '../../../convex/schema'

const IndexSchema = z.object({
  indexDescriptor: z.string(),
  fields: z.array(z.string()),
})

const TableSchema = z.object({
  tableName: z.string(),
  indexes: z.array(IndexSchema),
})

const SchemaExport = z.object({
  tables: z.array(TableSchema),
})

const phaseOneTables = [
  'owners',
  'businesses',
  'businessContexts',
  'businessServices',
  'serviceCapabilities',
  'claims',
  'operationKeys',
  'registryProjectionItems',
  'registryProjectionAttempts',
  'indexStatus',
  'discoveryManifests',
  'discoveryManifestAttempts',
  'auditEvents',
  'operatorControls',
  'disputes',
  'suppressionRules',
  'adminMemberships',
  'adminMembershipAuditEvents',
  'abuseRateLimitBuckets',
  'claimFingerprints',
  'funnelEvents',
  'ownerActivationState',
] as const

const requiredIndexes = {
  owners: ['by_clerkUserId'],
  businesses: ['by_slug', 'by_publicStatus_slug'],
  businessServices: ['by_business_status', 'by_slug_serviceSlug'],
  serviceCapabilities: ['by_business_service_status'],
  claims: ['by_owner_status', 'by_business_status'],
  operationKeys: ['by_actor_operation_key'],
  registryProjectionItems: ['by_business', 'by_service'],
  registryProjectionAttempts: ['by_business_status', 'by_logicalKey'],
  indexStatus: ['by_target_status', 'by_status_lastAttempt'],
  discoveryManifests: ['by_business_version'],
  discoveryManifestAttempts: ['by_business_status'],
  auditEvents: ['by_business_createdAt', 'by_correlationId'],
  suppressionRules: ['by_target_status'],
  disputes: ['by_business_status'],
  adminMemberships: ['by_clerkUserId_state'],
  operatorControls: ['by_key'],
  abuseRateLimitBuckets: ['by_scope_key_window'],
  claimFingerprints: ['by_fingerprint_status'],
  funnelEvents: ['by_session_createdAt', 'by_business_createdAt', 'by_source_stage'],
  ownerActivationState: ['by_business_stage'],
} satisfies Record<string, readonly string[]>

describe('Convex schema', () => {
  const exportSchema = Reflect.get(schema, 'export')
  if (typeof exportSchema !== 'function') {
    throw new Error('Convex schema export function is unavailable')
  }
  const exported = SchemaExport.parse(JSON.parse(String(exportSchema.call(schema))))

  it('contains exactly the Phase 1 durable tables', () => {
    expect(exported.tables.map((table) => table.tableName).sort()).toEqual([...phaseOneTables].sort())
  })

  it('defines every required Phase 1 index', () => {
    const tableIndexes = Object.fromEntries(
      exported.tables.map((table) => [table.tableName, table.indexes.map((index) => index.indexDescriptor)])
    )

    for (const [tableName, indexes] of Object.entries(requiredIndexes)) {
      expect(tableIndexes[tableName]).toEqual(expect.arrayContaining(indexes))
    }
  })
})
