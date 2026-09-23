/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  guardedAdminExceptionSource,
} from '../../../convex/lib/adminConsole/reads/exceptions'
import {
  convexTestWithMarketComponents,
  nonAdmin,
  ownerAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const CALL_REF = `operation-invocation:v1:${'a'.repeat(64)}`
const FRESH_CALL_REF = `operation-invocation:v1:${'b'.repeat(64)}`
const TOOL_REF = `operation:v1:${'c'.repeat(64)}`
const NOW = Date.now()

async function seedExceptions(backend: ConvexFixtureBackend): Promise<void> {
  await backend.run(async (ctx) => {
    const businessId = await ctx.db.insert('businesses', {
      owningAccountRef: `acc_${'d'.repeat(32)}`,
      slug: 'exception-provider',
      name: 'Exception Provider',
      normalizedName: 'exception provider',
      category: 'software',
      businessContext: {
        kind: 'programmable_provider',
        website: 'https://exception.example',
        providerIdentifier: 'exception-provider',
      },
      publicStatus: 'published',
      trustTier: 'claimed',
      sourceHash: 'sha256:exception-provider',
      createdAt: NOW - 4_000_000,
      updatedAt: NOW - 4_000_000,
    })
    const callBase: Omit<
      Doc<'capabilityCalls'>,
      '_id' | '_creationTime' | 'callRef' | 'idempotencyKey' | 'createdAt'
    > = {
      principalId: `prn_${'e'.repeat(32)}`,
      ownerId: `acc_${'d'.repeat(32)}`,
      credentialId: 'credential:admin-exceptions',
      applicationRef: 'application:admin-exceptions',
      toolRef: TOOL_REF,
      environment: 'sandbox',
      grantRef: 'grant:admin-exceptions',
      grantGeneration: 1,
      policyDigest: 'sha256:admin-exceptions-policy',
      grantExpiresAt: NOW + 60_000,
      inputDigest: 'sha256:admin-exceptions-input',
      requestDigest: 'sha256:admin-exceptions-request',
      state: 'reconciliation_required',
      reconciliation: {
        disposition: 'manual_review',
        reason: 'recovery_failed',
        attemptCount: 1,
        nextAttemptAt: NOW + 60_000,
      },
      updatedAt: NOW,
    }
    await ctx.db.insert('capabilityCalls', {
      ...callBase,
      callRef: CALL_REF,
      idempotencyKey: 'idempotency:admin-exceptions:old',
      createdAt: NOW - 60 * 60_000,
    })
    await ctx.db.insert('capabilityCalls', {
      ...callBase,
      callRef: FRESH_CALL_REF,
      idempotencyKey: 'idempotency:admin-exceptions:fresh',
      createdAt: NOW - 2 * 60_000,
    })
    await ctx.db.insert('disputes', {
      businessId,
      status: 'contested',
      openedByContactHash: 'sha256:contact',
      targetType: 'business',
      targetRef: String(businessId),
      reasonCode: 'other',
      evidenceHash: 'sha256:evidence',
      evidenceRefs: ['evidence:dispute'],
      publicMessageHash: 'sha256:message',
      operationKey: 'operation:dispute',
      operationKeys: ['operation:dispute'],
      correlationId: 'correlation:dispute',
      requestCount: 1,
      createdAt: NOW - 50 * 60_000,
      updatedAt: NOW - 45 * 60_000,
    })
    await ctx.db.insert('capabilityPublications', {
      publicationRef: 'publication:admin-exceptions',
      toolRef: TOOL_REF,
      revision: 1,
      businessId,
      networkId: 'base-sepolia',
      runtimeEnvironment: 'sandbox',
      capabilityId: 'capability:admin-exceptions',
      version: 1,
      contractDigest: 'sha256:contract',
      sourceKind: 'openapi_http',
      sourceRevision: '1',
      sourceDigest: 'sha256:source',
      sourceAuthorityState: 'review_required',
      publisherRef: `prn_${'e'.repeat(32)}`,
      authorityMode: 'provider_owned',
      provenanceDigest: 'sha256:provenance',
      offeringId: 'offering:admin-exceptions',
      bindingId: 'binding:admin-exceptions',
      disposition: 'current',
      credentialState: 'ready',
      healthState: 'healthy',
      readinessEvidenceRefs: [],
      registrationEvidenceRefs: [],
      createdAt: NOW - 40 * 60_000,
      updatedAt: NOW - 40 * 60_000,
    })
    await ctx.db.insert('capabilitySupplyAdmissionCases', {
      caseRef: 'admission-case:admin-exceptions',
      commandRef: 'command:admin-exceptions',
      commandDigest: 'sha256:command',
      owningAccountRef: `acc_${'d'.repeat(32)}`,
      businessId,
      providerRef: 'provider:admin-exceptions',
      toolRef: TOOL_REF,
      toolVersion: 1,
      publicationRef: 'publication:admin-exceptions',
      publicationRevision: 1,
      sourceKind: 'openapi_http',
      sourceDigest: 'sha256:source',
      sourceRevision: '1',
      sourceRouteRef: 'source-route:admin-exceptions',
      sourceAuthorityState: 'review_required',
      contractDigest: 'sha256:contract',
      scheduledReadbackRefs: [],
      state: 'submitted',
      terminalDecision: 'pending',
      blockerRefs: [],
      evidenceRefs: [],
      submittedAt: NOW - 30 * 60_000,
      updatedAt: NOW - 30 * 60_000,
    })
  })
}

describe('admin exception reads', () => {
  it('merges four exception sources oldest first and excludes fresh uncertain Calls', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    const caller = await ownerAdmin(backend, 'user_admin-exceptions-owner')

    const result = await caller.query(api.adminConsoleExceptions.listAdminExceptions, { kind: null })
    if ('kind' in result) throw new Error('admin_exception_fixture_unexpected_refusal')

    expect(result.unavailable).toEqual([])
    expect(result.items.map((item) => item.kind)).toEqual([
      'uncertain_call',
      'removal_dispute',
      'source_authority_review',
      'admission_case',
    ])
    expect(result.total).toBe(4)
    expect(result.truncated).toBe(false)
    expect(result.counts).toEqual({
      uncertain_call: 1,
      removal_dispute: 1,
      source_authority_review: 1,
      admission_case: 1,
    })
    expect(result.items.some((item) => item.kind === 'uncertain_call' && item.callRef === FRESH_CALL_REF)).toBe(false)
  })

  it('runs only the requested exception source', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    const caller = await ownerAdmin(backend, 'user_admin-exceptions-filter')

    const result = await caller.query(api.adminConsoleExceptions.listAdminExceptions, {
      kind: 'removal_dispute',
    })
    if ('kind' in result) throw new Error('admin_exception_fixture_unexpected_refusal')

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.kind).toBe('removal_dispute')
  })

  it('counts every review across index partitions, returns the oldest 100, and orders equal timestamps by kind then ref', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    await backend.run(async (ctx) => {
      const base = await ctx.db.query('capabilityPublications')
        .withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', TOOL_REF))
        .first()
      if (base === null) throw new Error('missing_publication_fixture')
      const { _id, _creationTime, sourceAuthorityState, ...publication } = base
      void _id
      void _creationTime
      void sourceAuthorityState
      const reviewRequired: Doc<'capabilityPublications'>['sourceAuthorityState'] = 'review_required'
      for (let index = 0; index < 103; index += 1) {
        await ctx.db.insert('capabilityPublications', {
          ...publication,
          publicationRef: `publication:review:${index}`,
          toolRef: `operation:v1:${index.toString(16).padStart(64, '0')}`,
          revision: index + 2,
          ...(index < 52 ? {} : { sourceAuthorityState: reviewRequired }),
          updatedAt: index < 52 ? NOW - 1_000_000 + index : NOW - 2_700_000 + index,
        })
      }
    })
    const caller = await ownerAdmin(backend, 'user_admin-exceptions-complete')
    const result = await caller.query(api.adminConsoleExceptions.listAdminExceptions, { kind: null })
    if ('kind' in result) throw new Error('admin_exception_fixture_unexpected_refusal')

    expect(result.counts.source_authority_review).toBe(104)
    expect(result.total).toBe(107)
    expect(result.truncated).toBe(true)
    expect(result.items).toHaveLength(100)
    expect(result.items[0]).toMatchObject({ kind: 'uncertain_call' })
    expect(result.items[1]).toMatchObject({ kind: 'removal_dispute' })
    expect(result.items[2]).toMatchObject({ kind: 'source_authority_review', publicationRef: `operation:v1:${(52).toString(16).padStart(64, '0')}` })
    const selected = await caller.query(api.adminConsoleExceptions.listAdminExceptions, { kind: 'source_authority_review' })
    if ('kind' in selected) throw new Error('admin_exception_fixture_unexpected_refusal')
    expect(selected.total).toBe(104)
    expect(selected.items).toHaveLength(100)
    expect(selected.counts).toEqual(result.counts)
  })

  it('breaks equal-time ties by kind then reference', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    await backend.run(async (ctx) => {
      const base = await ctx.db.query('capabilitySupplyAdmissionCases')
        .withIndex('by_caseRef', (q) => q.eq('caseRef', 'admission-case:admin-exceptions'))
        .unique()
      if (base === null) throw new Error('missing_case_fixture')
      const { _id, _creationTime, ...admissionCase } = base
      void _id
      void _creationTime
      await ctx.db.insert('capabilitySupplyAdmissionCases', {
        ...admissionCase,
        caseRef: 'admission-case:a',
        updatedAt: admissionCase.updatedAt,
      })
    })
    const caller = await ownerAdmin(backend, 'user_admin-exceptions-ties')
    const result = await caller.query(api.adminConsoleExceptions.listAdminExceptions, { kind: null })
    if ('kind' in result) throw new Error('admin_exception_fixture_unexpected_refusal')
    expect(result.items.slice(-2).map((item) => item.kind === 'admission_case' ? item.caseRef : '')).toEqual([
      'admission-case:a',
      'admission-case:admin-exceptions',
    ])
  })

  it('marks a rejecting source unavailable without throwing', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await guardedAdminExceptionSource('admission_case', async () => {
      throw new Error('fixture failure')
    })

    expect(result).toEqual({ unavailable: 'admission_case' })
    expect(warning).toHaveBeenCalledWith('admin_exception_source_unavailable', 'admission_case')
    warning.mockRestore()
  })

  it('returns recent Purchase resolutions newest first', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async (ctx) => {
      await ctx.db.insert('purchaseResolutionRecords', {
        resolutionRef: 'purchase-resolution:admin-exceptions',
        recordDigest: `sha256:${'f'.repeat(64)}`,
        callRef: CALL_REF,
        quoteRef: 'quote:admin-exceptions',
        accountRef: `acc_${'d'.repeat(32)}`,
        customerRef: 'customer:admin-exceptions',
        agentPrincipalRef: `prn_${'e'.repeat(32)}`,
        sellerRef: 'seller:admin-exceptions',
        providerRef: 'provider:admin-exceptions',
        paymentRecipientRef: 'recipient:admin-exceptions',
        terminalState: 'completed',
        deliveryState: 'delivered',
        paymentState: 'settled',
        considerationAmount: { currency: 'AUD', units: '100', exponent: 2 },
        considerationNetUnits: '91',
        considerationGstUnits: '9',
        providerObligationAmount: { currency: 'AUD', units: '100', exponent: 2 },
        resolvedAt: NOW,
        createdAt: NOW,
      })
    })
    const caller = await ownerAdmin(backend, 'user_admin-resolutions-owner')

    await expect(caller.query(
      api.adminConsoleExceptions.listRecentPurchaseResolutions,
      {},
    )).resolves.toEqual([{
      callRef: CALL_REF,
      terminalState: 'completed',
      resolvedAt: NOW,
    }])
  })

  it('refuses an authenticated non-admin', async () => {
    const backend = convexTestWithMarketComponents()
    const caller = await nonAdmin(backend, 'user_admin-exceptions-non-admin')

    await expect(caller.query(api.adminConsoleExceptions.listAdminExceptions, { kind: null }))
      .resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })
})
