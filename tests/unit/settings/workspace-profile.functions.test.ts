import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ auth: vi.fn(), mutation: vi.fn(), receipt: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/server/workspace-terminal-receipt', () => ({ readWorkspaceTerminalReceipt: boundary.receipt }))
vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: boundary.auth, clerkClient: vi.fn() }))
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
vi.mock('@/lib/server/convex-source', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  callSourceMutation: boundary.mutation,
}))

import { closeWorkspaceServer, renameWorkspaceThroughClerk, transferWorkspaceOwnershipServer } from '@/lib/server/workspace-profile.functions'
import { sourceWriteCommandDigest, verifySourceWriteAdmission, type SourceWriteAdmission, type SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import { installTestSourceWriteSecret } from '../../helpers/source-write-admission'

const ownerBinding = {
  accountRef: 'account:one',
  displayName: 'Acme',
  accountRevision: 1,
  callerIsOwner: true,
  clerkOrgId: 'org_one',
  ownerDisplayName: 'Acme Owner',
  ownerClerkUserId: 'user_owner',
}

describe('workspace name writer', () => {
  it('updates the bound Clerk organisation exactly once, then waits for webhook confirmation', async () => {
    const update = vi.fn().mockResolvedValue({ name: 'New Acme' })
    const result = await renameWorkspaceThroughClerk('New Acme', 'account:one', 'org_one', async () => ownerBinding, update)
    expect(result).toEqual({ kind: 'accepted', name: 'New Acme' })
    expect(update).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith('org_one', 'New Acme')
  })

  it('refuses a non-owner or a different active organisation before any Clerk write', async () => {
    const update = vi.fn()
    expect(await renameWorkspaceThroughClerk('New Acme', 'account:one', 'org_one', async () => ({ ...ownerBinding, callerIsOwner: false }), update))
      .toEqual({ kind: 'refused', code: 'forbidden' })
    expect(await renameWorkspaceThroughClerk('New Acme', 'account:one', 'org_other', async () => ownerBinding, update))
      .toEqual({ kind: 'refused', code: 'forbidden' })
    expect(await renameWorkspaceThroughClerk('New Acme', 'account:stale', 'org_one', async () => ownerBinding, update))
      .toEqual({ kind: 'refused', code: 'forbidden' })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('workspace consequence server producers', () => {
  const now = 1_800_000_000_000
  const commandFields = { expectedAccountRef: 'account:reviewed', expectedAccountRevision: 4,
    expectedOwnershipRevision: 3, correlationRef: 'ui:workspace:close', idempotencyRef: 'workspace:operation:one' }
  const context = { sourceWriteRequest: { method: 'POST', initiatorOrigin: 'https://ae.example',
    targetOrigin: 'https://ae.example', targetPath: '/_serverFn/workspace', targetQuery: '', bodyDigest: 'none' } }
  const proof = { reverificationId: 'reverify:server:one', firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 2,
    subject: 'user_owner', evidenceObservedAt: now - 30_000 }
  const close = closeWorkspaceServer as unknown as (input: { data: unknown; context: unknown }) => Promise<unknown>
  const transfer = transferWorkspaceOwnershipServer as unknown as (input: { data: unknown; context: unknown }) => Promise<unknown>
  type SentCommand = Record<string, unknown> & { sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest }

  beforeEach(() => {
    installTestSourceWriteSecret()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    boundary.mutation.mockReset()
    boundary.auth.mockReset().mockResolvedValue({ isAuthenticated: true, userId: 'user_owner',
      has: vi.fn().mockReturnValue(true), factorVerificationAge: [1, 2],
      sessionClaims: { reverification_id: proof.reverificationId, iat: (now - 30_000) / 1_000 } })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it.each(['close', 'transfer'] as const)('signs the exact %s target and command using the genuine Clerk and source helpers', async action => {
    const data = action === 'close' ? { ...commandFields, confirmationName: 'Reviewed workspace' }
      : { ...commandFields, successorPrincipalRef: 'principal:successor' }
    const receipt = { kind: action === 'close' ? 'closed' : 'transferred', accountRef: commandFields.expectedAccountRef }
    boundary.mutation.mockResolvedValue(receipt)
    expect(await (action === 'close' ? close : transfer)({ data, context })).toEqual(receipt)
    expect(boundary.mutation).toHaveBeenCalledOnce()
    const [reference, sent] = boundary.mutation.mock.calls[0] as [unknown, SentCommand]
    expect(reference).toBeDefined()
    const { sourceWrite, sourceWriteRequest, ...command } = sent
    expect(command).toEqual({ ...data, operationKey: data.idempotencyRef, correlationId: data.correlationRef, proof })
    expect(sourceWriteRequest).toEqual({ ...context.sourceWriteRequest, bodyDigest: sourceWrite.bodyDigest })
    expect(await verifySourceWriteAdmission({ admission: sourceWrite, now,
      expected: { scope: 'protected_action', operationKey: data.idempotencyRef,
        correlationId: data.correlationRef, commandDigest: sourceWriteCommandDigest(command), request: sourceWriteRequest } }))
      .toMatchObject({ kind: 'accepted' })
    expect(await verifySourceWriteAdmission({ admission: sourceWrite, now,
      expected: { scope: 'protected_action', operationKey: data.idempotencyRef, correlationId: data.correlationRef,
        commandDigest: sourceWriteCommandDigest({ ...command, expectedAccountRef: 'account:other' }), request: sourceWriteRequest } }))
      .toEqual({ kind: 'rejected', reason: 'source_write_command_mismatch' })
    expect(boundary.auth).toHaveBeenCalledOnce()
  })

  it.each(['replayed', 'refused'] as const)('forwards a signed command without proof so the backend can return %s', async kind => {
    boundary.auth.mockResolvedValue({ isAuthenticated: true, userId: 'user_owner', has: () => false })
    const receipt = kind === 'replayed' ? { kind, accountRef: commandFields.expectedAccountRef, accountRevision: 5 }
      : { kind, code: 'mfa_reverification_required' }
    boundary.mutation.mockResolvedValue(receipt)
    expect(await close({ data: { ...commandFields, confirmationName: 'Reviewed workspace' }, context })).toEqual(receipt)
    const sent = boundary.mutation.mock.calls[0]?.[1] as SentCommand
    expect(sent).not.toHaveProperty('proof')
    expect(await verifySourceWriteAdmission({ admission: sent.sourceWrite, now,
      expected: { scope: 'protected_action', operationKey: commandFields.idempotencyRef,
        correlationId: commandFields.correlationRef, commandDigest: sourceWriteCommandDigest(sent), request: sent.sourceWriteRequest } }))
      .toMatchObject({ kind: 'accepted' })
  })

  it.each(['close', 'transfer'] as const)('rejects browser-supplied proof before %s signing or delegation', async action => {
    const data = action === 'close' ? { ...commandFields, confirmationName: 'Reviewed workspace', proof }
      : { ...commandFields, successorPrincipalRef: 'principal:successor', proof }
    await expect((action === 'close' ? close : transfer)({ data, context })).rejects.toThrow()
    expect(boundary.auth).not.toHaveBeenCalled()
    expect(boundary.mutation).not.toHaveBeenCalled()
  })
})
