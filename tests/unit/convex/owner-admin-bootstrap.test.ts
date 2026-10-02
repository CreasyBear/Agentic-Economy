/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { convexModules, nonAdmin } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const command = (key: string) => ({ reasonCode: 'Initial platform administration', evidenceRefs: ['approval:board:one'], operationKey: key, correlationId: `corr:${key}` })
const read = api.security.readOwnerAdminBootstrap
const bootstrap = api.security.bootstrapOwnerAdmin

afterEach(() => vi.unstubAllEnvs())

describe('first-owner bootstrap authority and readback', () => {
  it('requires canonical owner authority and allowlist eligibility without creating membership or audit', async () => {
    const backend = convexTest(schema, convexModules)
    vi.stubEnv('ADMIN_BOOTSTRAP_PRINCIPAL_IDS', 'user_allowed')
    const allowed = await nonAdmin(backend, 'user_allowed')
    const other = await nonAdmin(backend, 'user_other')
    expect(await allowed.query(read, {})).toEqual({ kind: 'eligible' })
    expect(await other.query(read, {})).toEqual({ kind: 'ineligible', reason: 'unauthorized_bootstrap_principal' })
    expect(await backend.query(read, {})).toEqual({ kind: 'ineligible', reason: 'canonical_owner_authority_required' })
    expect(await backend.withIdentity({ subject: 'user_allowed', issuer: 'https://identity.example', tokenIdentifier: 'unbound' }).query(read, {}))
      .toEqual({ kind: 'ineligible', reason: 'canonical_owner_authority_required' })
    const rows = await backend.run(async ctx => ({ memberships: await ctx.db.query('adminMemberships').collect(), audits: await ctx.db.query('auditEvents').collect() }))
    expect(rows.memberships).toEqual([])
    expect(rows.audits.filter(row => row.eventType === 'admin.membership_bootstrapped')).toEqual([])
  })

  it.each(['', 'key with spaces', 'a'.repeat(201)])('refuses invalid direct-query operation references: %s', async operationKey => {
    const backend = convexTest(schema, convexModules)
    expect(await backend.query(read, { operationKey })).toEqual({ kind: 'ineligible', reason: 'invalid_request' })
  })

  it('refuses an identity conflict before bootstrap or recovery evidence is returned', async () => {
    const backend = convexTest(schema, convexModules)
    const owner = await nonAdmin(backend, 'user_conflict')
    vi.stubEnv('ADMIN_BOOTSTRAP_PRINCIPAL_IDS', 'user_conflict')
    await backend.run(ctx => ctx.db.insert('adminMemberships', { clerkUserId: 'user_conflict', tokenIdentifier: 'another-token', role: 'support', state: 'active', grantedBy: 'fixture', grantedAt: 1 }))
    expect(await owner.query(read, { operationKey: 'bootstrap:conflict' })).toEqual({ kind: 'ineligible', reason: 'membership_conflict' })
    expect(await owner.mutation(bootstrap, await withSourceWrite('admin_operator', command('bootstrap:conflict')))).toMatchObject({ kind: 'error', reason: 'membership_conflict' })
  })

  it('records exactly one membership and matching audit, then reads its exact operation without replaying the write', async () => {
    const backend = convexTest(schema, convexModules)
    const owner = await nonAdmin(backend, 'user_initial')
    const other = await nonAdmin(backend, 'user_other')
    vi.stubEnv('ADMIN_BOOTSTRAP_PRINCIPAL_IDS', 'user_initial,user_other')
    const input = command('bootstrap:initial')
    expect(await owner.mutation(bootstrap, await withSourceWrite('admin_operator', input))).toMatchObject({ kind: 'ok', membership: { clerkUserId: 'user_initial', tokenIdentifier: 'token_initial', state: 'active', role: 'owner_admin' } })
    const auditEventRef = 'audit:admin.membership_bootstrapped:user_initial:bootstrap:initial'
    expect(await owner.query(read, { operationKey: input.operationKey })).toEqual({ kind: 'active', auditEventRef })
    expect(await owner.query(read, { operationKey: 'bootstrap:unrelated' })).toEqual({ kind: 'active', auditEventRef: null })
    expect(await other.query(read, { operationKey: input.operationKey })).toEqual({ kind: 'ineligible', reason: 'owner_admin_already_exists' })
    expect(await owner.mutation(bootstrap, await withSourceWrite('admin_operator', input))).toMatchObject({ kind: 'error' })
    const recorded = await backend.run(async ctx => ({ memberships: await ctx.db.query('adminMemberships').collect(), audits: (await ctx.db.query('auditEvents').collect()).filter(row => row.eventType === 'admin.membership_bootstrapped') }))
    expect(recorded.memberships).toHaveLength(1)
    expect(recorded.audits).toHaveLength(1)
    expect(recorded.audits[0]).toMatchObject({ eventId: auditEventRef, idempotencyKey: input.operationKey, evidenceRefs: input.evidenceRefs })
    await backend.run(async ctx => { const membership = recorded.memberships[0]!; await ctx.db.patch(membership._id, { state: 'revoked' }) })
    expect(await owner.query(read, { operationKey: input.operationKey })).toEqual({ kind: 'recorded', auditEventRef })
  })

  it('allows only one concurrent first owner and one bootstrap audit', async () => {
    const backend = convexTest(schema, convexModules)
    const first = await nonAdmin(backend, 'user_race_first')
    const second = await nonAdmin(backend, 'user_race_second')
    vi.stubEnv('ADMIN_BOOTSTRAP_PRINCIPAL_IDS', 'user_race_first,user_race_second')
    expect(await first.query(read, {})).toEqual({ kind: 'eligible' })
    expect(await second.query(read, {})).toEqual({ kind: 'eligible' })
    const [a, b] = await Promise.all([withSourceWrite('admin_operator', command('bootstrap:first')), withSourceWrite('admin_operator', command('bootstrap:second'))])
    const results = await Promise.all([first.mutation(bootstrap, a), second.mutation(bootstrap, b)])
    expect(results.filter(result => result.kind === 'ok')).toHaveLength(1)
    expect(results.filter(result => result.kind === 'error')).toHaveLength(1)
    const rows = await backend.run(async ctx => ({ memberships: await ctx.db.query('adminMemberships').collect(), audits: await ctx.db.query('auditEvents').collect() }))
    expect(rows.memberships.filter(row => row.state === 'active' && row.role === 'owner_admin')).toHaveLength(1)
    expect(rows.audits.filter(row => row.eventType === 'admin.membership_bootstrapped')).toHaveLength(1)
  })
})
