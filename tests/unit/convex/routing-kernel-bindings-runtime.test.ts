import { describe, expect, it } from 'vitest'

import { register, setEligibility } from '../../../convex/routingKernelBindings'

type Row = Record<string, unknown> & { _id: string }
type RegisterArgs = {
  registration: {
    bindingId: string
    businessId: string
    nodeId: string
    networkId: string
    capabilityContractId: string
    operation: string
    admission: 'admitted' | 'not_admitted'
    conformance: 'conformant' | 'not_conformant'
    admissionEvidenceRefs: string[]
    conformanceEvidenceRefs: string[]
    queryTerms: string[]
    adapterFeatures: { requestCancellation: 'supported' | 'unsupported' }
    adapterFeatureEvidenceRefs: string[]
    endpointUrl: string
    credentialRef: string
  }
}
type Handler = (ctx: { db: FakeDb; auth: FakeAuth }, args: RegisterArgs) => Promise<unknown>

const registerHandler = (register as unknown as { _handler: Handler })._handler
const eligibilityHandler = (setEligibility as unknown as { _handler: (ctx: { db: FakeDb; auth: FakeAuth }, args: Record<string, unknown>) => Promise<unknown> })._handler

describe('routing-kernel binding registration authority', () => {
  it('refuses unauthenticated and non-owner-admin callers', async () => {
    const db = database('support')

    await expect(registerHandler({ db, auth: new FakeAuth(null) }, args())).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    await expect(registerHandler({ db, auth: new FakeAuth(identity()) }, args())).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    expect(db.rows('routingKernelBindings')).toEqual([])
  })

  it('lets an owner admin register one normalized, idempotent binding for a published business', async () => {
    const db = database('owner_admin')
    const ctx = { db, auth: new FakeAuth(identity()) }

    await expect(registerHandler(ctx, args())).resolves.toEqual({ kind: 'registered', bindingId: 'binding:labels' })

    expect(db.rows('routingKernelBindings')).toEqual([
      expect.objectContaining({
        bindingId: 'binding:labels',
        businessId: 'businesses:1',
        admission: 'admitted',
        conformance: 'conformant',
        admissionEvidenceRefs: ['evidence:operator-admission:labels:v1'],
        conformanceEvidenceRefs: ['evidence:contract-test:shipping-label:v1'],
        queryTerms: ['book label', 'shipping label'],
        adapterFeatures: { requestCancellation: 'supported' },
        adapterFeatureEvidenceRefs: ['evidence:cancel-contract:v1'],
        endpointUrl: 'https://provider.example/capability',
        credentialRef: 'env:LABEL_PROVIDER_TOKEN',
        registrationHash: expect.any(String),
        registeredAt: expect.any(Number),
      }),
    ])
    expect(db.rows('routingKernelBindings')[0]?.registrationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('revokes eligibility with evidence and rejects stale concurrent reviews', async () => {
    const db = database('owner_admin')
    const ctx = { db, auth: new FakeAuth(identity()) }
    await registerHandler(ctx, args())
    const hash = String(db.rows('routingKernelBindings')[0]?.registrationHash)

    const updated = await eligibilityHandler(ctx, {
      bindingId: 'binding:labels', expectedRegistrationHash: hash,
      admission: 'not_admitted', conformance: 'not_conformant',
      admissionEvidenceRefs: ['evidence:revocation:incident-1'],
      conformanceEvidenceRefs: ['evidence:contract-failure:incident-1'],
    })
    expect(updated).toMatchObject({ kind: 'updated', bindingId: 'binding:labels', registrationHash: expect.any(String) })
    expect((updated as { registrationHash: string }).registrationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(db.rows('routingKernelBindings')[0]).toMatchObject({
      admission: 'not_admitted', conformance: 'not_conformant',
      admissionEvidenceRefs: ['evidence:revocation:incident-1'],
      conformanceEvidenceRefs: ['evidence:contract-failure:incident-1'],
    })

    await expect(eligibilityHandler(ctx, {
      bindingId: 'binding:labels', expectedRegistrationHash: hash,
      admission: 'admitted', conformance: 'conformant',
      admissionEvidenceRefs: ['evidence:stale-review'], conformanceEvidenceRefs: ['evidence:stale-review'],
    })).resolves.toEqual({ kind: 'refused', reason: 'binding_changed' })
  })
})

function args(): RegisterArgs {
  return {
    registration: {
      bindingId: 'binding:labels',
      businessId: 'businesses:1',
      nodeId: 'business:labels',
      networkId: 'registered-businesses',
      capabilityContractId: 'shipping.label.book:v1',
      operation: 'book',
      admission: 'admitted',
      conformance: 'conformant',
      admissionEvidenceRefs: ['evidence:operator-admission:labels:v1'],
      conformanceEvidenceRefs: ['evidence:contract-test:shipping-label:v1'],
      queryTerms: [' Shipping Label ', 'book label', 'shipping label'],
      adapterFeatures: { requestCancellation: 'supported' },
      adapterFeatureEvidenceRefs: ['evidence:cancel-contract:v1'],
      endpointUrl: 'https://provider.example/capability',
      credentialRef: 'env:LABEL_PROVIDER_TOKEN',
    },
  }
}

function identity() {
  return { issuer: 'https://clerk.example', subject: 'admin_1', tokenIdentifier: 'token:admin_1' }
}

function database(role: 'owner_admin' | 'support'): FakeDb {
  return new FakeDb({
    businesses: [{ _id: 'businesses:1', publicStatus: 'published', claimStatus: 'published' }],
    adminMemberships: [{
      _id: 'adminMemberships:1', clerkUserId: 'admin_1', tokenIdentifier: 'token:admin_1', role,
      state: 'active', grantedBy: 'bootstrap', grantedAt: 1,
    }],
    routingKernelBindings: [],
  })
}

class FakeAuth {
  constructor(private readonly value: ReturnType<typeof identity> | null) {}
  async getUserIdentity() { return this.value }
}

class FakeDb {
  private readonly tables: Record<string, Row[]>
  constructor(rows: Record<string, Row[]>) { this.tables = structuredClone(rows) }
  async get(id: string) { return Object.values(this.tables).flat().find((row) => row._id === id) ?? null }
  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }
  async insert(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    const id = `${table}:${rows.length + 1}`
    rows.push({ _id: id, ...value })
    return id
  }
  async patch(id: string, value: Record<string, unknown>) {
    const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id)
    if (row === undefined) throw new Error(`row_not_found:${id}`)
    Object.assign(row, value)
  }
  rows(table: string) { return structuredClone(this.tables[table] ?? []) }
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = []
  constructor(private readonly rows: Row[]) {}
  withIndex(_name: string, callback: (builder: FakeQuery) => FakeQuery) { return callback(this) }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  async unique() {
    const matches = this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value))
    if (matches.length > 1) throw new Error('not_unique')
    return matches[0] ?? null
  }
}
