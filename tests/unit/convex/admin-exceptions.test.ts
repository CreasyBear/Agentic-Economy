/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  convexTestWithMarketComponents,
  nonAdmin,
  ownerAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const CALL_REF = `operation-invocation:v1:${'a'.repeat(64)}`
const FRESH_CALL_REF = `operation-invocation:v1:${'b'.repeat(64)}`
const TOOL_REF = `operation:v1:${'c'.repeat(64)}`
const NOW = Date.UTC(2026, 8, 22, 12)

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
  beforeEach(() => vi.setSystemTime(NOW))
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it('pages the selected indexed state, reaches records after 500, and does not read other kinds', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    await backend.run(async (ctx) => {
      const base = await ctx.db.query('capabilityPublications')
        .withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', TOOL_REF)).first()
      if (base === null) throw new Error('missing_publication_fixture')
      const { _id, _creationTime, ...publication } = base
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert('capabilityPublications', {
          ...publication,
          publicationRef: `publication:review:${index}`,
          toolRef: `operation:v1:${index.toString(16).padStart(64, '0')}`,
          revision: index + 2,
          updatedAt: NOW - 2_700_000 + index,
        })
      }
    })
    const admin = await ownerAdmin(backend, 'user_admin-exceptions-owner')
    let cursor: string | null = null
    const refs: string[] = []
    for (;;) {
      const result: { page: readonly { kind: string; publicationRef?: string }[]; isDone: boolean; continueCursor: string }
        = await admin.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
        kind: 'source_authority_review', partition: 'review_required',
        paginationOpts: { numItems: 51, cursor },
      })
      refs.push(...result.page.map((row) => row.publicationRef ?? ''))
      if (result.isDone) break
      cursor = result.continueCursor
    }
    expect(refs).toHaveLength(502)
    expect(refs).toContain(`operation:v1:${(500).toString(16).padStart(64, '0')}`)
    const disputed = await admin.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
      kind: 'removal_dispute', partition: 'contested', paginationOpts: { numItems: 10, cursor: null },
    })
    if ('kind' in disputed) throw new Error('admin_exception_fixture_unexpected_refusal')
    expect(disputed.page).toHaveLength(1)
    expect(disputed.page[0]?.kind).toBe('removal_dispute')
    const unset = await admin.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
      kind: 'source_authority_review', partition: 'unset', paginationOpts: { numItems: 10, cursor: null },
    })
    if ('kind' in unset) throw new Error('admin_exception_fixture_unexpected_refusal')
    expect(unset.page).toEqual([])
  })

  it('advances a bounded cursor past unprojectable legacy records and keeps queue/detail authority aligned', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    await backend.run(async (ctx) => {
      const base = await ctx.db.query('capabilityPublications')
        .withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', TOOL_REF)).first()
      if (base === null) throw new Error('missing_publication_fixture')
      const { _id, _creationTime, sourceAuthorityState: _sourceAuthorityState, ...publication } = base
      for (let index = 0; index < 210; index += 1) {
        await ctx.db.insert('capabilityPublications', {
          ...publication,
          publicationRef: `publication:unset:invalid:${index}`,
          toolRef: `legacy-invalid-${index}`,
          updatedAt: NOW - 70 * 60_000 + index,
        })
      }
      await ctx.db.insert('capabilityPublications', {
        ...publication,
        publicationRef: 'publication:unset:valid',
        toolRef: `operation:v1:${'f'.repeat(64)}`,
        updatedAt: NOW - 50 * 60_000,
      })
    })
    const admin = await ownerAdmin(backend, 'user_admin-exceptions-unset')
    const first = await admin.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
      kind: 'source_authority_review', partition: 'unset',
      paginationOpts: { numItems: 50, cursor: null },
    })
    if ('kind' in first) throw new Error('unexpected_refusal')
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    let cursor = first.continueCursor
    let found = false
    for (let scan = 0; scan < 10 && !found; scan += 1) {
      const next = await admin.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
        kind: 'source_authority_review', partition: 'unset',
        paginationOpts: { numItems: 50, cursor },
      })
      if ('kind' in next) throw new Error('unexpected_refusal')
      expect(next.continueCursor).not.toBe(cursor)
      found = next.page.some((entry) => entry.kind === 'source_authority_review'
        && entry.publicationRef === `operation:v1:${'f'.repeat(64)}`)
      cursor = next.continueCursor
    }
    expect(found).toBe(true)
    const detail = await admin.query(api.adminConsoleObjects.readAdminObject, {
      ref: { kind: 'tool_version', ref: `operation:v1:${'f'.repeat(64)}` },
    })
    expect(detail).toMatchObject({ kind: 'tool_version', sourceAuthorityState: 'unset' })
  })

  it('reports observed bounds and partition exhaustion without inventing a total', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    const admin = await ownerAdmin(backend, 'user_admin-exceptions-overview')
    const overview = await admin.query(api.adminConsoleExceptions.readAdminExceptionOverview, {})
    if (!Array.isArray(overview)) throw new Error('unexpected_refusal')
    expect(overview.find((part) => part.partition === 'contested'))
      .toMatchObject({ kind: 'removal_dispute', observed: 1, complete: true, unavailable: false })
    const page = await admin.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
      kind: 'uncertain_call', partition: 'reconciliation_required', paginationOpts: { numItems: 10, cursor: null },
    })
    if ('kind' in page) throw new Error('unexpected_refusal')
    expect(page.page).toEqual([{ kind: 'uncertain_call', callRef: CALL_REF, since: NOW - 60 * 60_000 }])
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

  it('reads the exact closed dispute and completed admission without adding them to actionable pages', async () => {
    const backend = convexTestWithMarketComponents()
    await seedExceptions(backend)
    const disputeRef = await backend.run(async (ctx) => {
      const dispute = await ctx.db.query('disputes')
        .withIndex('by_status_and_updatedAt', (q) => q.eq('status', 'contested')).first()
      const admission = await ctx.db.query('capabilitySupplyAdmissionCases')
        .withIndex('by_caseRef', (q) => q.eq('caseRef', 'admission-case:admin-exceptions')).unique()
      if (dispute === null || admission === null) throw new Error('missing_exact_exception_fixture')
      await ctx.db.patch(dispute._id, { status: 'closed' })
      await ctx.db.patch(admission._id, { state: 'completed', terminalDecision: 'published' })
      return String(dispute._id)
    })
    const admin = await ownerAdmin(backend, 'user_admin-exception-exact')
    const closed = await admin.query(api.adminConsoleExceptions.readAdminException, {
      kind: 'removal_dispute', ref: disputeRef,
    })
    const completed = await admin.query(api.adminConsoleExceptions.readAdminException, {
      kind: 'admission_case', ref: 'admission-case:admin-exceptions',
    })
    expect(closed).toMatchObject({ kind: 'removal_dispute', disputeRef, state: 'closed' })
    expect(completed).toMatchObject({ kind: 'admission_case', caseRef: 'admission-case:admin-exceptions', state: 'completed' })
    const actionable = await admin.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
      kind: 'removal_dispute', partition: 'contested', paginationOpts: { numItems: 10, cursor: null },
    })
    expect(actionable.page).toEqual([])
    const nonAdminCaller = await nonAdmin(backend, 'user_admin-exception-exact-denied')
    await expect(nonAdminCaller.query(api.adminConsoleExceptions.readAdminException, {
      kind: 'removal_dispute', ref: disputeRef,
    })).resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })

  it('refuses an authenticated non-admin', async () => {
    const backend = convexTestWithMarketComponents()
    const caller = await nonAdmin(backend, 'user_admin-exceptions-non-admin')

    await expect(caller.query(api.adminConsoleExceptions.listAdminExceptionsPage, {
      kind: 'admission_case', partition: 'submitted', paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toEqual({ page: [], isDone: true, continueCursor: '' })
    await expect(caller.query(api.adminConsoleExceptions.readAdminExceptionOverview, {}))
      .resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })
})
