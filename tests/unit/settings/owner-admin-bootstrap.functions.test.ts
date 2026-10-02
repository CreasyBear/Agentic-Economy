import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), header: vi.fn() }))
vi.mock('@tanstack/react-start', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  createServerFn: () => {
    const builder = (validate: (value: unknown) => unknown) => ({
      validator: (next: (value: unknown) => unknown) => builder(next),
      handler: (handler: (input: { data: unknown; context: unknown }) => Promise<unknown>) =>
        async (input: { data?: unknown; context?: unknown } = {}) =>
          await handler({ data: validate(input.data), context: input.context }),
    })
    return builder(value => value)
  },
}))
vi.mock('@tanstack/react-start/server', () => ({ setResponseHeader: boundary.header }))
vi.mock('@/lib/server/convex-source', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  callSourceQuery: boundary.query,
  callSourceMutation: boundary.mutation,
}))

import { bootstrapOwnerAdminServer, readOwnerAdminBootstrapServer } from '@/modules/security/owner-admin-bootstrap.functions'
import { sourceWriteRequestFromRequest } from '@/lib/server/source-write-admission'
import { sourceWriteCommandDigest, verifySourceWriteAdmission, type SourceWriteAdmission, type SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import { installTestSourceWriteSecret } from '../../helpers/source-write-admission'

const now = 1_800_000_000_000
const data = { reasonCode: 'Initial platform administration', evidenceRefs: ['approval:board:one'], operationKey: 'bootstrap:one', correlationId: 'corr:bootstrap:one' }
const context = { sourceWriteRequest: { method: 'POST', initiatorOrigin: 'https://ae.example', targetOrigin: 'https://ae.example', targetPath: '/_serverFn/bootstrap', targetQuery: '', bodyDigest: 'none' } }
const submit = bootstrapOwnerAdminServer as unknown as (input: { data: unknown; context: unknown }) => Promise<unknown>
const read = readOwnerAdminBootstrapServer as unknown as (input: { data?: unknown }) => Promise<unknown>
type SentCommand = typeof data & { sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest }

beforeEach(() => {
  installTestSourceWriteSecret()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  boundary.query.mockReset().mockResolvedValue({ kind: 'eligible' })
  boundary.mutation.mockReset()
  boundary.header.mockReset()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('owner bootstrap server producer', () => {
  it('admits canonical HTTPS behind Vercel TLS termination and signs the unchanged request and command', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
    const request = new Request('http://ae.example/_serverFn/bootstrap?mode=exact&x=%2F', {
      method: 'POST', headers: { Origin: 'https://ae.example', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'untrusted.example' },
    })
    const captured = sourceWriteRequestFromRequest({ request, body: JSON.stringify(data) })
    expect(captured).toMatchObject({ method: 'POST', initiatorOrigin: 'https://ae.example', targetOrigin: 'https://ae.example',
      targetPath: '/_serverFn/bootstrap', targetQuery: '?mode=exact&x=%2F' })
    boundary.mutation.mockResolvedValue({ kind: 'ok' })
    expect(await submit({ data, context: { sourceWriteRequest: captured } })).toEqual({ kind: 'active', auditEventRef: null })
    const sent = boundary.mutation.mock.calls[0]?.[1] as SentCommand
    expect(sent).toMatchObject(data)
    expect(sent.sourceWriteRequest).toEqual({ ...captured, bodyDigest: sent.sourceWrite.bodyDigest })
    expect(await verifySourceWriteAdmission({ admission: sent.sourceWrite, now, expected: {
      scope: 'admin_operator', operationKey: data.operationKey, correlationId: data.correlationId,
      commandDigest: sourceWriteCommandDigest(data), request: sent.sourceWriteRequest,
    } })).toMatchObject({ kind: 'accepted' })
  })

  it.each([
    { label: 'outside Vercel', vercel: '0' },
    { label: 'missing forwarded protocol', protocol: '' },
    { label: 'forwarded HTTP', protocol: 'http' },
    { label: 'noncanonical protocol casing', protocol: 'HTTPS' },
    { label: 'multiple forwarded protocols', protocol: 'https,http' },
    { label: 'foreign host with forged forwarded host', host: 'other.example' },
    { label: 'wrong target port', host: 'ae.example:8080' },
    { label: 'foreign browser Origin', origin: 'https://other.example' },
    { label: 'HTTP canonical configuration', canonical: 'http://ae.example' },
  ])('refuses $label before reading authority or writing', async scenario => {
    vi.stubEnv('VERCEL', scenario.vercel ?? '1')
    vi.stubEnv('AE_CANONICAL_BASE_URL', scenario.canonical ?? 'https://ae.example')
    const request = new Request(`http://${scenario.host ?? 'ae.example'}/_serverFn/bootstrap`, {
      method: 'POST', headers: { Origin: scenario.origin ?? 'https://ae.example',
        'x-forwarded-proto': scenario.protocol ?? 'https', 'x-forwarded-host': 'ae.example' },
    })
    const captured = sourceWriteRequestFromRequest({ request, body: JSON.stringify(data) })
    expect(await submit({ data, context: { sourceWriteRequest: captured } })).toEqual({ kind: 'refused', reason: 'request_unavailable' })
    expect(boundary.query).not.toHaveBeenCalled()
    expect(boundary.mutation).not.toHaveBeenCalled()
  })

  it('signs the exact explicit command from the genuine POST context and returns the durable readback receipt', async () => {
    const receipt = { kind: 'active', auditEventRef: 'audit:admin.membership_bootstrapped:user_owner:bootstrap:one' }
    boundary.query.mockResolvedValueOnce({ kind: 'eligible' }).mockResolvedValueOnce(receipt)
    boundary.mutation.mockResolvedValue({ kind: 'ok' })
    expect(await submit({ data, context })).toEqual(receipt)
    expect(boundary.mutation).toHaveBeenCalledOnce()
    expect(boundary.query).toHaveBeenNthCalledWith(1, expect.anything(), { operationKey: data.operationKey })
    expect(boundary.query).toHaveBeenNthCalledWith(2, expect.anything(), { operationKey: data.operationKey })
    const sent = boundary.mutation.mock.calls[0]?.[1] as SentCommand
    const { sourceWrite, sourceWriteRequest, ...command } = sent
    expect(command).toEqual(data)
    expect(sourceWriteRequest).toEqual({ ...context.sourceWriteRequest, bodyDigest: sourceWrite.bodyDigest })
    expect(await verifySourceWriteAdmission({ admission: sourceWrite, now, expected: {
      scope: 'admin_operator', operationKey: data.operationKey, correlationId: data.correlationId,
      commandDigest: sourceWriteCommandDigest(data), request: sourceWriteRequest,
    } })).toMatchObject({ kind: 'accepted' })
    expect(await verifySourceWriteAdmission({ admission: sourceWrite, now, expected: {
      scope: 'admin_operator', operationKey: data.operationKey, correlationId: data.correlationId,
      commandDigest: sourceWriteCommandDigest({ ...data, evidenceRefs: ['approval:substituted'] }), request: sourceWriteRequest,
    } })).toEqual({ kind: 'rejected', reason: 'source_write_command_mismatch' })
    expect(boundary.header).toHaveBeenCalledWith('cache-control', 'private, no-store')
  })

  it.each([
    { kind: 'ineligible', reason: 'owner_admin_already_exists' },
    { kind: 'active', auditEventRef: 'audit:recorded' },
    { kind: 'recorded', auditEventRef: 'audit:revoked' },
  ])('reads current authority before any retry and does not write for $kind', async status => {
    boundary.query.mockResolvedValue(status)
    expect(await submit({ data, context })).toEqual(status)
    expect(boundary.mutation).not.toHaveBeenCalled()
  })

  it.each([undefined, {}, { sourceWriteRequest: { ...context.sourceWriteRequest, method: 'GET' } },
    { sourceWriteRequest: { ...context.sourceWriteRequest, initiatorOrigin: 'https://other.example' } },
  ])('refuses missing or invalid genuine request context before reading or writing', async invalidContext => {
    expect(await submit({ data, context: invalidContext })).toEqual({ kind: 'refused', reason: 'request_unavailable' })
    expect(boundary.query).not.toHaveBeenCalled()
    expect(boundary.mutation).not.toHaveBeenCalled()
  })

  it.each([{ clerkUserId: 'user_fabricated' }, { tokenIdentifier: 'fabricated-token' }, { evidenceRefs: [] }, { reasonCode: ' ' }])('rejects browser identity or invalid command fields before delegation', async fields => {
    await expect(submit({ data: { ...data, ...fields }, context })).rejects.toThrow()
    expect(boundary.query).not.toHaveBeenCalled()
    expect(boundary.mutation).not.toHaveBeenCalled()
  })

  it('leaves an uncertain acknowledgement unresolved and only the explicit read call observes recovery', async () => {
    boundary.mutation.mockRejectedValue(new Error('acknowledgement lost'))
    expect(await submit({ data, context })).toEqual({ kind: 'unknown' })
    expect(boundary.mutation).toHaveBeenCalledOnce()
    expect(boundary.query).toHaveBeenCalledOnce()
    boundary.query.mockResolvedValue({ kind: 'active', auditEventRef: 'audit:committed' })
    expect(await read({ data: { operationKey: data.operationKey } })).toEqual({ kind: 'active', auditEventRef: 'audit:committed' })
    expect(boundary.mutation).toHaveBeenCalledOnce()
  })

  it('keeps a confirmed successful mutation successful if its receipt read is unavailable', async () => {
    boundary.mutation.mockResolvedValue({ kind: 'ok' })
    boundary.query.mockResolvedValueOnce({ kind: 'eligible' }).mockRejectedValueOnce(new Error('read unavailable'))
    expect(await submit({ data, context })).toEqual({ kind: 'active', auditEventRef: null })
    expect(boundary.mutation).toHaveBeenCalledOnce()
  })

  it('keeps a failed recovery read unavailable without calling the writer', async () => {
    boundary.query.mockRejectedValue(new Error('read unavailable'))
    expect(await read({ data: { operationKey: data.operationKey } })).toEqual({ kind: 'unavailable' })
    expect(boundary.mutation).not.toHaveBeenCalled()
  })
})
