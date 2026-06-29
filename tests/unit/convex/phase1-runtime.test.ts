import { describe, expect, it } from 'vitest'
import type { UserIdentity } from 'convex/server'

import { claimBusiness } from '../../../convex/business'
import { publishBusinessCatalog } from '../../../convex/catalog'
import { readDiscoveryHealth, regenerateDiscoveryManifest } from '../../../convex/discovery'
import { getPublicBusinessCatalogBySlug } from '../../../convex/registry'
import {
  sourceWriteAdmission,
  withSourceWrite,
} from '../../helpers/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  unique: () => Promise<Row | null>
  first: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  get: (id: string) => Promise<Row | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

type AuthCtx = {
  db: Db
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

type QueryCtx = { db: Db }

type Handler<Args> = (ctx: AuthCtx, args: Args) => Promise<unknown>
type QueryHandler<Args> = (ctx: QueryCtx, args: Args) => Promise<unknown>

type ClaimArgs = {
  name: string
  category: string
  suburb: string
  stateTerritory: string
  requestedSlug: string
  ownerMessage?: string
  sourceRefs: { label: string; evidenceRef: string; sourceHash?: string }[]
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  sourceWrite?: SourceWriteAdmission
  operationKey: string
  correlationId: string
}

type PublishArgs = {
  claimId: string
  operationKey: string
  correlationId: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  sourceWrite?: SourceWriteAdmission
  services: ServiceArg[]
}

type ServiceArg = {
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: {
    mode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
    publicDisclosure?: string
    publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
    noContactReason?: string
  }
}

type ClaimOk = {
  kind: 'ok'
  owner: { ownerId: string }
  business: { businessId: string; slug: string }
  claim: { claimId: string }
}

type PublishOk = {
  kind: 'ok'
  catalog: { services: { summary: string }[] }
}

// Convex registers handlers against the full runtime context; these unit tests provide only the db/auth members read by the bridge handlers.
const claimHandler = (claimBusiness as unknown as { _handler: Handler<ClaimArgs> })._handler
const publishHandler = (publishBusinessCatalog as unknown as { _handler: Handler<PublishArgs> })._handler
const detailHandler = (getPublicBusinessCatalogBySlug as unknown as { _handler: QueryHandler<{ slug: string }> })._handler
const discoveryHealthHandler = (readDiscoveryHealth as unknown as { _handler: QueryHandler<{ businessId: string }> })._handler
const regenerateHandler = (regenerateDiscoveryManifest as unknown as {
  _handler: Handler<{
    businessId: string
    csrfToken?: string
    csrfCookie?: string
    origin?: string
    sourceWrite?: SourceWriteAdmission
  }>
})._handler

describe('Convex Phase 1 runtime bridge', () => {
  it('authenticates owner claims, persists source rows, and rejects forged static CSRF plus duplicate slugs', async () => {
    const db = new FakeDb()

    const missingCsrf = await claimHandler(
      authCtx(db, sam()),
      claimArgs('Sam Plumbing', 'sam-plumbing', 'claim-missing', { csrfToken: 'csrf-claim', csrfCookie: 'csrf-claim' })
    )
    expect(missingCsrf).toMatchObject({ kind: 'error', code: 'claim_csrf_rejected' })
    expect(db.dump('owners')).toHaveLength(0)

    const created = await claimHandler(
      authCtx(db, sam()),
      withSourceWrite('owner_claim', claimArgs('Sam Plumbing', 'sam-plumbing', 'claim-created'))
    )
    const claim = requireClaimOk(created)
    expect(claim.business).toMatchObject({ slug: 'sam-plumbing' })
    expect(db.dump('owners')).toHaveLength(1)
    expect(db.dump('businesses')).toHaveLength(1)
    expect(db.dump('businessContexts')).toHaveLength(1)
    expect(db.dump('claims')).toHaveLength(1)

    const duplicateSlug = await claimHandler(
      authCtx(db, sam()),
      withSourceWrite('owner_claim', claimArgs('Different Plumbing', 'sam-plumbing', 'claim-duplicate-slug'))
    )
    expect(duplicateSlug).toMatchObject({ kind: 'error', code: 'claim_slug_conflict' })
    expect(db.dump('businesses')).toHaveLength(1)
  })

  it('publishes only for the source-bound owner and exposes registry plus discovery readbacks from persisted rows', async () => {
    const db = new FakeDb()
    const created = requireClaimOk(
      await claimHandler(
        authCtx(db, sam()),
        withSourceWrite('owner_claim', claimArgs('Sam Plumbing', 'sam-plumbing', 'claim-created'))
      )
    )

    const wrongOwner = await publishHandler(
      authCtx(db, alex()),
      publishArgs(created.claim.claimId, 'publish-wrong-owner', validServices(), 'csrf-wrong-owner')
    )
    expect(wrongOwner).toMatchObject({ kind: 'error', code: 'catalog_publish_wrong_owner' })

    const invalidServiceResult = await publishHandler(
      authCtx(db, sam()),
      publishArgs(created.claim.claimId, 'publish-invalid', invalidServices(), 'csrf-invalid')
    )
    expect(invalidServiceResult).toMatchObject({ kind: 'error', code: 'catalog_publish_invalid_services' })

    const published = requirePublishOk(
      await publishHandler(authCtx(db, sam()), publishArgs(created.claim.claimId, 'publish-valid', validServices(), 'csrf-publish'))
    )
    expect(published.catalog.services).toEqual([expect.objectContaining({ summary: 'Burst pipe triage and repair.' })])
    expect(db.dump('businesses')[0]).toMatchObject({ publicStatus: 'published', claimStatus: 'published' })
    expect(db.dump('businessServices')).toHaveLength(1)
    expect(db.dump('serviceCapabilities')).toHaveLength(1)

    const detail = await detailHandler(queryCtx(db), { slug: 'sam-plumbing' })
    expect(detail).toMatchObject({
      kind: 'found',
      business: {
        slug: 'sam-plumbing',
        services: [expect.objectContaining({ summary: 'Burst pipe triage and repair.' })],
      },
    })

    const degradedHealth = await discoveryHealthHandler(queryCtx(db), { businessId: created.business.businessId })
    expect(degradedHealth).toMatchObject({
      sourceState: 'published',
      discoveryStatus: 'degraded',
      repairAction: 'regenerate_manifest',
    })

    const regenerated = await regenerateHandler(authCtx(db, sam()), {
      businessId: created.business.businessId,
      csrfToken: 'csrf-discovery',
      csrfCookie: 'csrf-discovery',
      sourceWrite: sourceWriteAdmission('discovery_repair', 'discovery:regenerate:sam'),
    })
    expect(regenerated).toMatchObject({ kind: 'ok', code: 'discovery_manifest_generated' })

    const availableHealth = await discoveryHealthHandler(queryCtx(db), { businessId: created.business.businessId })
    expect(availableHealth).toMatchObject({
      sourceState: 'published',
      discoveryStatus: 'available',
      latestManifest: { slug: 'sam-plumbing' },
      latestAttempt: { status: 'succeeded' },
    })
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: EqFilter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly rows: readonly Row[],
    private readonly filters: readonly EqFilter[] = []
  ) {}

  withIndex(_indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.rows, [...this.filters, ...builder.filters])
  }

  async collect(): Promise<Row[]> {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  async unique(): Promise<Row | null> {
    return (await this.collect()).at(0) ?? null
  }

  async first(): Promise<Row | null> {
    return this.unique()
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(this.table(tableName))
  }

  async get(id: string): Promise<Row | null> {
    return this.allRows().find((row) => row._id === id) ?? null
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    this.sequence += 1
    const id = `${tableName}:${this.sequence}`
    this.table(tableName).push({ _id: id, _creationTime: this.sequence, ...value })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = await this.get(id)
    if (row === null) {
      throw new Error(`Missing row ${id}`)
    }
    Object.assign(row, value)
  }

  dump(tableName: string): Row[] {
    return [...this.table(tableName)]
  }

  private table(tableName: string): Row[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }

  private allRows(): Row[] {
    return Object.values(this.tables).flat()
  }
}

function authCtx(db: FakeDb, identity: UserIdentity | null): AuthCtx {
  return {
    db,
    auth: {
      getUserIdentity: async () => identity,
    },
  }
}

function queryCtx(db: FakeDb): QueryCtx {
  return { db }
}

function sam(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_sam',
    subject: 'user_sam',
    issuer: 'https://clerk.example.test',
    name: 'Sam Owner',
    email: 'sam@example.test',
  }
}

function alex(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_alex',
    subject: 'user_alex',
    issuer: 'https://clerk.example.test',
    name: 'Alex Owner',
    email: 'alex@example.test',
  }
}

function claimArgs(name: string, slug: string, key: string, csrf: { csrfToken?: string; csrfCookie?: string } = {}): ClaimArgs {
  return {
    name,
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    requestedSlug: slug,
    ownerMessage: 'Owner supplied source facts.',
    sourceRefs: [{ label: 'Owner intake', evidenceRef: `source:${key}` }],
    ...csrf,
    operationKey: key,
    correlationId: `corr:${key}`,
  }
}

function publishArgs(claimId: string, key: string, services: ServiceArg[], csrf: string): PublishArgs {
  return withSourceWrite('catalog_publish', {
    claimId,
    operationKey: key,
    correlationId: `corr:${key}`,
    csrfToken: csrf,
    csrfCookie: csrf,
    services,
  })
}

function validServices(): ServiceArg[] {
  return [
    {
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Burst pipe triage and repair.',
      serviceArea: 'Parramatta and nearby suburbs',
      hoursOrUnknown: 'Owner supplied hours',
      firstRequest: {
        mode: 'inquiry_available',
        publicDisclosure: 'Use the public business contact method listed by the owner.',
        publicChannel: 'public_business_contact',
      },
    },
  ]
}

function invalidServices(): ServiceArg[] {
  return [
    {
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Burst pipe triage and repair.',
      serviceArea: 'Parramatta and nearby suburbs',
      hoursOrUnknown: 'Owner supplied hours',
      firstRequest: {
        mode: 'not_available_yet',
        publicDisclosure: 'Not ready',
        publicChannel: 'public_business_contact',
      },
    },
  ]
}

function requireClaimOk(value: unknown): ClaimOk {
  const record = requireRecord(value)
  expect(record.kind).toBe('ok')
  const owner = requireRecord(record.owner)
  const business = requireRecord(record.business)
  const claim = requireRecord(record.claim)
  return {
    kind: 'ok',
    owner: { ownerId: requireString(owner.ownerId) },
    business: { businessId: requireString(business.businessId), slug: requireString(business.slug) },
    claim: { claimId: requireString(claim.claimId) },
  }
}

function requirePublishOk(value: unknown): PublishOk {
  const record = requireRecord(value)
  expect(record.kind).toBe('ok')
  const catalog = requireRecord(record.catalog)
  const rawServices = catalog.services
  if (!Array.isArray(rawServices)) {
    throw new Error('Expected catalog services array')
  }
  return {
    kind: 'ok',
    catalog: {
      services: rawServices.map((service) => ({ summary: requireString(requireRecord(service).summary) })),
    },
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected record')
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Expected string')
  }
  return value
}
