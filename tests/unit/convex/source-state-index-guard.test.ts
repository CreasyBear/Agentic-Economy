import { describe, expect, it } from 'vitest'

import { sourceStateUpsertLookupCoverage } from '../../../convex/source_state'

describe('source-state upsert index guard', () => {
  it('requires every persisted UpsertSpec to resolve without collect fallback', () => {
    const coverage = sourceStateUpsertLookupCoverage()

    expect(coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableName: 'adminMemberships', fields: ['tokenIdentifier', 'state'], lookupKind: 'index', indexName: 'by_tokenIdentifier_state' }),
        expect.objectContaining({ tableName: 'adminMemberships', fields: ['clerkUserId', 'state'], lookupKind: 'index', indexName: 'by_clerkUserId_state' }),
        expect.objectContaining({ tableName: 'registrySearchDocuments', fields: ['documentId'], lookupKind: 'index', indexName: 'by_documentId' }),
      ]),
    )
    expect(coverage.filter((row) => row.lookupKind === 'missing')).toEqual([])
    expect(coverage.map((row) => `${row.tableName}:${row.fields.join('+')}`)).toMatchInlineSnapshot(`
      [
        "owners:ownerId",
        "businesses:businessId",
        "businessContexts:businessId",
        "claims:claimId",
        "claimFingerprints:fingerprint+status",
        "abuseRateLimitBuckets:scope+key+window",
        "businessServices:serviceId",
        "serviceCapabilities:businessId+serviceId+kind",
        "registryProjectionItems:logicalKey",
        "registryProjectionAttempts:logicalKey",
        "registrySearchDocuments:documentId",
        "registrySearchSyncAttempts:attemptId",
        "indexStatus:targetType+targetRef",
        "discoveryManifests:businessId+ucpVersion",
        "discoveryManifestAttempts:attemptId",
        "adminMemberships:tokenIdentifier+state",
        "adminMemberships:clerkUserId+state",
        "adminMembershipAuditEvents:auditEventId",
        "disputes:disputeId",
        "suppressionRules:targetType+targetRef+status",
        "operationKeys:actorRef+operationName+key",
        "auditEvents:eventId",
        "operatorControls:key",
        "funnelEvents:correlationId",
        "ownerActivationState:businessId",
      ]
    `)
  })
})
