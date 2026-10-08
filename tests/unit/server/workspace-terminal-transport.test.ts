import { afterEach, expect, it, vi } from 'vitest'
import { makeFunctionReference } from 'convex/server'
import { createInteractiveAuthorityBackend } from '../../helpers/interactive-authority-runtime'
import { seedInteractiveAuthority, INTERACTIVE_ACCOUNT_REF, INTERACTIVE_TOKEN_IDENTIFIER } from '../../helpers/interactive-authority-seed'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import { withSourceWrite } from '../../helpers/source-write-admission'

const boundary = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: boundary.auth, clerkClient: vi.fn() }))
vi.mock('@tanstack/react-start', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  createServerFn: () => {
    const builder = (validate: (value: unknown) => unknown) => ({
      validator: (next: (value: unknown) => unknown) => builder(next),
      handler: (handler: (input: { data: unknown; context: unknown }) => Promise<unknown>) =>
        async (input: { data?: unknown; context?: unknown } = {}) => handler({ data: validate(input.data), context: input.context }),
    })
    return builder(value => value)
  },
}))
import { closeWorkspaceServer } from '@/lib/server/workspace-profile.functions'
import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { readWorkspaceTerminalReceipt } from '@/lib/server/workspace-terminal-receipt'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('confirms a lost close response through authenticated HTTP receipt transport after the sole workspace loses authority', async () => {
  const backend = createInteractiveAuthorityBackend()
  await seedInteractiveAuthority(backend)
  const identity = samIdentity(INTERACTIVE_TOKEN_IDENTIFIER, { sid: 'sess_original' })
  const session = backend.withIdentity(identity)
  const command = { expectedAccountRef: INTERACTIVE_ACCOUNT_REF, expectedAccountRevision: 4, expectedOwnershipRevision: 3,
    confirmationName: 'Canonical account', correlationRef: 'transport:lost-close', idempotencyRef: 'transport:close:one' }
  const signed = await withSourceWrite('protected_action', { ...command, operationKey: command.idempotencyRef, correlationId: command.correlationRef,
    proof: { reverificationId: 'transport:proof:one', firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1,
      subject: identity.subject, evidenceObservedAt: Date.now() } })
  await expect(session.mutation(makeFunctionReference<'mutation'>('workspaceAccounts:closeWorkspace'), signed)).resolves.toMatchObject({ kind: 'closed' })
  const paths: string[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer original-actor.jwt')
    const { path, args } = JSON.parse(String(init?.body))
    paths.push(path)
    let value: unknown
    if (path === 'interactiveAuthority:materializeCurrentInteractiveAuthority') value = false
    else {
      expect(path).toBe('workspaceAccounts:readWorkspaceTerminalReceipt')
      value = await session.query(makeFunctionReference<'query'>('workspaceAccounts:readWorkspaceTerminalReceipt'), args[0])
    }
    return new Response(JSON.stringify({ status: 'success', value }))
  }
  vi.stubEnv('CONVEX_URL', 'https://receipt-test.convex.cloud')
  vi.stubGlobal('fetch', fetch)
  boundary.auth.mockResolvedValue({ isAuthenticated: true, getToken: async () => 'original-actor.jwt' })
  await expect(closeWorkspaceServer({ data: command })).resolves.toEqual({ kind: 'replayed', accountRef: INTERACTIVE_ACCOUNT_REF, accountRevision: 5 })
  expect(paths).toEqual(['workspaceAccounts:readWorkspaceTerminalReceipt'])
  await expect(readWorkspaceTerminalReceipt({ action: 'close', ...command, confirmationName: 'different command' })).rejects.toThrow()
  await expect(callSourceMutation(sourceMutation('workspaceAccounts:closeWorkspace'), signed, {
    authObject: { isAuthenticated: true, getToken: async () => 'original-actor.jwt' },
  })).rejects.toMatchObject({ code: 'missing_auth' })
  expect(paths.at(-1)).toBe('interactiveAuthority:materializeCurrentInteractiveAuthority')
  await backend.run(async ctx => {
    const binding = await ctx.db.query('externalIdentityBindings').withIndex('by_providerNamespace_and_providerIdentifier', q => q.eq('providerNamespace', 'clerk/user').eq('providerIdentifier', INTERACTIVE_TOKEN_IDENTIFIER)).unique()
    await ctx.db.patch(binding!._id, { interactiveSessionsRevokedBefore: Date.now() })
  })
  await expect(readWorkspaceTerminalReceipt({ action: 'close', ...command })).rejects.toThrow()
  const stranger = backend.withIdentity(samIdentity('https://clerk.example.test|user_stranger'))
  await expect(stranger.query(makeFunctionReference<'query'>('workspaceAccounts:readWorkspaceTerminalReceipt'), { command: { action: 'close', ...command } })).rejects.toThrow()
})
