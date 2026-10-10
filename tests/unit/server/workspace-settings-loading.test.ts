import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), query: vi.fn(), action: vi.fn(), mutation: vi.fn(),
  legacyQuery: vi.fn(), publicDetail: vi.fn(), getUser: vi.fn(), header: vi.fn(), capture: vi.fn(), request: new AbortController() }))
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  const builder = { validator: () => builder, handler: (fn: () => unknown) => fn }
  return builder
} }))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => ({ signal: mocks.request.signal }), setResponseHeader: mocks.header }))
vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: vi.fn(), clerkClient: () => ({ users: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/server/convex-source', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/server/convex-source')>(),
  createAuthenticatedSourceTransport: mocks.createTransport, callSourceQuery: mocks.legacyQuery,
}))
vi.mock('@/modules/registry/registry.functions', async importOriginal => ({
  ...await importOriginal<typeof import('@/modules/registry/registry.functions')>(),
  readPublicOfferingRegistryBusinessDetail: mocks.publicDetail,
}))
vi.mock('@/lib/observability/degrade', () => ({ degrade: (cause: unknown, fallback: unknown) => { mocks.capture(cause); return fallback } }))
import { SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { readWorkspaceSettingsServer } from '@/lib/server/workspace-settings.functions'

const identity = { kind: 'available', businessId: 'business:fixture', name: 'Fixture Provider', slug: 'fixture', publicStatus: 'published' }
const catalog = { businessId: identity.businessId, slug: identity.slug, disposition: 'current', name: identity.name }
const binding = { accountRef: 'account:fixture', displayName: 'user_fixture', accountRevision: 1, callerIsOwner: true,
  clerkOrgId: null, ownerDisplayName: 'Fixture Owner', ownerClerkUserId: 'user_fixture' }
const transport = { query: mocks.query, action: mocks.action, mutation: mocks.mutation }
function queryResult(reference: Parameters<typeof getFunctionName>[0]) {
  switch (getFunctionName(reference)) {
    case 'catalog:getCurrentOwnerProviderIdentity': return identity
    case 'catalog:getCurrentOwnerPublicCatalog': return { kind: 'available', catalog }
    case 'workspaceAccounts:readWorkspaceOrganizationBinding': return binding
    default: throw new Error('Unexpected backend read')
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.request = new AbortController()
  mocks.createTransport.mockResolvedValue(transport)
  mocks.query.mockImplementation(async reference => queryResult(reference))
  mocks.legacyQuery.mockRejectedValue(new Error('Unexpected second materialization'))
  mocks.publicDetail.mockResolvedValue({ kind: 'available' })
  mocks.getUser.mockResolvedValue({ firstName: 'Clerk', lastName: 'Fixture', emailAddresses: [] })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('Workspace settings composed read', () => {
  it('materializes once and preserves all existing authenticated backend reads and public detail visibility', async () => {
    const result = await readWorkspaceSettingsServer()
    expect(result).toMatchObject({ identity, status: { kind: 'available', value: { catalog } }, defaultName: "Fixture Owner's account" })
    expect(mocks.createTransport).toHaveBeenCalledExactlyOnceWith({ signal: expect.any(AbortSignal) })
    expect(mocks.query.mock.calls.map(([ref]) => getFunctionName(ref)).sort()).toEqual([
      'catalog:getCurrentOwnerProviderIdentity', 'catalog:getCurrentOwnerProviderIdentity',
      'catalog:getCurrentOwnerPublicCatalog', 'workspaceAccounts:readWorkspaceOrganizationBinding',
    ].sort())
    expect(mocks.query.mock.calls.every(([, args]) => Object.keys(args).length === 0)).toBe(true)
    expect(mocks.publicDetail).toHaveBeenCalledExactlyOnceWith({ slug: identity.slug }, { signal: expect.any(AbortSignal) })
    expect(mocks.legacyQuery).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.action).not.toHaveBeenCalled(); expect(mocks.mutation).not.toHaveBeenCalled()
    expect(mocks.header).toHaveBeenCalledWith('cache-control', 'private, no-store')
  })

  it('creates a separate transport for every invocation and retains Clerk as personal-name owner', async () => {
    mocks.query.mockImplementation(async reference => getFunctionName(reference) === 'workspaceAccounts:readWorkspaceOrganizationBinding'
      ? { ...binding, ownerDisplayName: 'user_fixture' } : queryResult(reference))
    await readWorkspaceSettingsServer(); await readWorkspaceSettingsServer()
    expect(mocks.createTransport).toHaveBeenCalledTimes(2)
    expect(mocks.getUser).toHaveBeenCalledTimes(2)
    expect(mocks.getUser).toHaveBeenCalledWith(binding.ownerClerkUserId)
    expect(mocks.query).toHaveBeenCalledTimes(8)
  })

  it('keeps identity and workspace name when only the public-status source fails', async () => {
    mocks.query.mockImplementation(async reference => {
      if (getFunctionName(reference) === 'catalog:getCurrentOwnerPublicCatalog') throw new Error('public_status_unavailable')
      return queryResult(reference)
    })
    expect(await readWorkspaceSettingsServer()).toMatchObject({ identity, status: { kind: 'unavailable' }, defaultName: "Fixture Owner's account" })
    expect(mocks.createTransport).toHaveBeenCalledOnce()
  })

  it('preserves the provider business-mismatch fence', async () => {
    mocks.query.mockImplementation(async reference => getFunctionName(reference) === 'catalog:getCurrentOwnerPublicCatalog'
      ? { kind: 'available', catalog: { ...catalog, businessId: 'business:other' } } : queryResult(reference))
    expect(await readWorkspaceSettingsServer()).toMatchObject({ identity, status: { kind: 'conflict', reason: 'business_mismatch' } })
  })

  it('does not invent a default name when its source rejects', async () => {
    mocks.query.mockImplementation(async reference => {
      if (getFunctionName(reference) === 'workspaceAccounts:readWorkspaceOrganizationBinding') throw new Error('binding_unavailable')
      return queryResult(reference)
    })
    await expect(readWorkspaceSettingsServer()).rejects.toThrow('binding_unavailable')
  })

  it('stops waiting for auth and dispatches no owner reads when materialization arrives after cancellation', async () => {
    let finish!: (value: typeof transport) => void
    mocks.createTransport.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const pending = readWorkspaceSettingsServer()
    mocks.request.abort(new DOMException('Navigation cancelled.', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    finish(transport); await Promise.resolve(); await Promise.resolve()
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.publicDetail).not.toHaveBeenCalled(); expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('rejects cancellation promptly and prevents late binding data from starting a Clerk lookup', async () => {
    let finish!: (value: typeof binding) => void
    mocks.query.mockImplementation(reference => getFunctionName(reference) === 'workspaceAccounts:readWorkspaceOrganizationBinding'
      ? new Promise(resolve => { finish = resolve }) : Promise.resolve(queryResult(reference)))
    const pending = readWorkspaceSettingsServer()
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(4))
    mocks.request.abort(new DOMException('Navigation cancelled.', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    finish({ ...binding, ownerDisplayName: 'user_fixture' }); await Promise.resolve(); await Promise.resolve()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('bounds a stalled status source without losing successful fields or starting a late public read', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Read deadline.', 'TimeoutError')), ms)
      return controller.signal
    })
    let finish!: (value: unknown) => void
    mocks.query.mockImplementation(reference => getFunctionName(reference) === 'catalog:getCurrentOwnerPublicCatalog'
      ? new Promise(resolve => { finish = resolve }) : Promise.resolve(queryResult(reference)))
    const pending = readWorkspaceSettingsServer()
    await vi.advanceTimersByTimeAsync(SOURCE_READ_TIMEOUT_MS)
    expect(await pending).toMatchObject({ identity, status: { kind: 'unavailable' }, defaultName: "Fixture Owner's account" })
    finish({ kind: 'available', catalog }); await Promise.resolve(); await Promise.resolve()
    expect(mocks.publicDetail).not.toHaveBeenCalled()
  })
})
