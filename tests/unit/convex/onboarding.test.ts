import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  describe,
  expect,
  it,
} from 'vitest'

import { InteractiveAuthorityError } from '../../../convex/interactiveAuthority'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  collectAuthorityTables,
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

type OnboardingRoleIntent = 'buyer' | 'supplier'

type OnboardingState =
  | Readonly<{
    phase: 'incomplete'
    accountRef: string
    suggestedWorkspaceName: string
  }>
  | Readonly<{
    phase: 'complete'
    accountRef: string
    roleIntent: OnboardingRoleIntent
    redirectPath: '/owner' | '/owner/operations'
  }>

type CompleteOnboardingResult = Readonly<{
  kind: 'completed'
  accountRef: string
  roleIntent: OnboardingRoleIntent
  redirectPath: '/owner' | '/owner/operations'
}>

type OnboardingRefusalCode = string

const readStateRef = makeFunctionReference<
  'query',
  Record<string, never>,
  OnboardingState
>('interactiveOnboarding:readState')

const completeRef = makeFunctionReference<
  'mutation',
  Readonly<{
    roleIntent: OnboardingRoleIntent
    workspaceName: string
    correlationRef: string
  }>,
  CompleteOnboardingResult
>('interactiveOnboarding:complete')

type CompletionRow = Readonly<{
  accountRef: string
  roleIntent: OnboardingRoleIntent
  workspaceName: string
  correlationRef: string
  revision: number
}>

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:onboarding:${label}`

async function readOnboardingState(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<OnboardingState> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readStateRef, {})
}

async function completeOnboarding(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    roleIntent: OnboardingRoleIntent
    workspaceName: string
    correlationRef: string
  }>,
  presentedIdentity: UserIdentity = identity(),
): Promise<CompleteOnboardingResult> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(completeRef, input)
}

async function expectOnboardingRefusal(
  run: () => Promise<unknown>,
  code: OnboardingRefusalCode,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function readAccountDisplayName(backend: InteractiveAuthorityBackend): Promise<string> {
  return await backend.run(async (ctx) => {
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT_REF))
      .unique()
    if (account === null) throw new Error('account missing')
    return account.displayName
  })
}

async function readAccountLifecycle(
  backend: InteractiveAuthorityBackend,
): Promise<string> {
  return await backend.run(async (ctx) => {
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT_REF))
      .unique()
    if (account === null) throw new Error('account missing')
    return account.lifecycle
  })
}

async function listCompletionRows(backend: InteractiveAuthorityBackend): Promise<CompletionRow[]> {
  return await backend.run(async (ctx) =>
    // Table lands with Phase 4 schema; cast keeps RED tests typecheck-clean pre-codegen.
    (await (ctx.db as { query: (table: string) => { collect: () => Promise<CompletionRow[]> } })
      .query('interactiveOnboardingCompletions')
      .collect()))
}

async function seedCompletionRow(
  backend: InteractiveAuthorityBackend,
  roleIntent: OnboardingRoleIntent,
  workspaceName: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('interactiveOnboardingCompletions', {
      accountRef: ACCOUNT_REF,
      principalRef: PRINCIPAL_REF,
      roleIntent,
      workspaceName,
      revision: 1,
      completedAt: 100,
      correlationRef: correlationRef('seed'),
    })
  })
}

describe('interactiveOnboarding', () => {
  it('C1: unauthenticated complete refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectOnboardingRefusal(
      () => backend.mutation(completeRef, {
        roleIntent: 'buyer',
        workspaceName: 'Acme Corp',
        correlationRef: correlationRef('c1'),
      }),
      'identity_invalid',
    )
  })

  it('C2: active owner account without a completion row is already complete', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readOnboardingState(backend)).resolves.toEqual({
      phase: 'complete',
      accountRef: ACCOUNT_REF,
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
  })

  it('C2b: active workspace membership without a completion row is already complete', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { addMembershipToOwnership: true })

    await expect(readOnboardingState(backend)).resolves.toEqual({
      phase: 'complete',
      accountRef: ACCOUNT_REF,
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    expect(await listCompletionRows(backend)).toHaveLength(0)
  })

  it('C3: completing an active owner account is a no-op', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const result = await completeOnboarding(backend, {
      roleIntent: 'buyer',
      workspaceName: 'Acme Corp',
      correlationRef: correlationRef('c3'),
    })

    expect(result).toMatchObject({
      kind: 'completed',
      accountRef: ACCOUNT_REF,
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    expect(await readAccountDisplayName(backend)).toBe('Canonical account')
    expect(await listCompletionRows(backend)).toHaveLength(0)
  })

  it('C4: an existing supplier completion keeps its owner operations redirect', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedCompletionRow(backend, 'supplier', 'Tools Lab')

    const result = await completeOnboarding(backend, {
      roleIntent: 'supplier',
      workspaceName: 'Tools Lab',
      correlationRef: correlationRef('c4'),
    })

    expect(result).toMatchObject({
      kind: 'completed',
      roleIntent: 'supplier',
      redirectPath: '/owner/operations',
    })
  })

  it('C5: a valid padded workspace name leaves an active account unchanged', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await completeOnboarding(backend, {
      roleIntent: 'buyer',
      workspaceName: '  Acme Corp  ',
      correlationRef: correlationRef('c5'),
    })

    expect(await readAccountDisplayName(backend)).toBe('Canonical account')
  })

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
  ] as const)('C6: invalid workspace name (%s) refuses display_name_invalid', async (_label, workspaceName) => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectOnboardingRefusal(
      () => completeOnboarding(backend, {
        roleIntent: 'buyer',
        workspaceName,
        correlationRef: correlationRef(`c6-${_label}`),
      }),
      'display_name_invalid',
    )

    expect(await readAccountDisplayName(backend)).toBe('Canonical account')
    expect(await listCompletionRows(backend)).toHaveLength(0)
  })

  it('C7: workspace name longer than 200 chars refuses display_name_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectOnboardingRefusal(
      () => completeOnboarding(backend, {
        roleIntent: 'buyer',
        workspaceName: 'a'.repeat(201),
        correlationRef: correlationRef('c7'),
      }),
      'display_name_invalid',
    )
  })

  it('C8: replaying complete for an active account is idempotent', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const input = {
      roleIntent: 'buyer' as const,
      workspaceName: 'Acme Corp',
      correlationRef: correlationRef('c8'),
    }

    const first = await completeOnboarding(backend, input)
    const second = await completeOnboarding(backend, input)

    expect(second).toEqual(first)
    expect(await readAccountDisplayName(backend)).toBe('Canonical account')
    expect(await listCompletionRows(backend)).toHaveLength(0)
  })

  it('C9: changing an existing recorded completion refuses onboarding_already_complete', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedCompletionRow(backend, 'buyer', 'Acme Corp')

    await expectOnboardingRefusal(
      () => completeOnboarding(backend, {
        roleIntent: 'supplier',
        workspaceName: 'Acme Corp',
        correlationRef: correlationRef('c9'),
      }),
      'onboarding_already_complete',
    )

    expect(await readAccountDisplayName(backend)).toBe('Canonical account')
  })

  it('C10: invalid correlationRef refuses correlation_ref_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectOnboardingRefusal(
      () => completeOnboarding(backend, {
        roleIntent: 'buyer',
        workspaceName: 'Acme Corp',
        correlationRef: '',
      }),
      'correlation_ref_invalid',
    )
  })

  it('C11: completing an active member workspace is an idempotent no-op', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    const first = await completeOnboarding(backend, {
      roleIntent: 'buyer',
      workspaceName: 'Ignored workspace name',
      correlationRef: correlationRef('c11-first'),
    })
    const second = await completeOnboarding(backend, {
      roleIntent: 'supplier',
      workspaceName: 'Also ignored',
      correlationRef: correlationRef('c11-second'),
    })

    expect(first).toMatchObject({
      kind: 'completed',
      accountRef: ACCOUNT_REF,
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
    expect(second).toEqual(first)
    expect(await readAccountDisplayName(backend)).toBe('Canonical account')
    expect(await listCompletionRows(backend)).toHaveLength(0)
  })

  it('C12: readState after completion reports complete buyer redirect', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await completeOnboarding(backend, {
      roleIntent: 'buyer',
      workspaceName: 'Acme Corp',
      correlationRef: correlationRef('c12'),
    })

    await expect(readOnboardingState(backend)).resolves.toEqual({
      phase: 'complete',
      accountRef: ACCOUNT_REF,
      roleIntent: 'buyer',
      redirectPath: '/owner',
    })
  })

  it('C13: readState and complete do not insert extra accounts or credentials', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const before = await collectAuthorityTables(backend)

    await readOnboardingState(backend)
    const afterRead = await collectAuthorityTables(backend)
    expect(afterRead.accounts).toHaveLength(before.accounts.length)
    expect(afterRead.credentials).toHaveLength(before.credentials.length)

    await completeOnboarding(backend, {
      roleIntent: 'buyer',
      workspaceName: 'Acme Corp',
      correlationRef: correlationRef('c13'),
    })
    const afterComplete = await collectAuthorityTables(backend)

    expect(afterComplete.accounts).toHaveLength(before.accounts.length)
    expect(afterComplete.credentials).toHaveLength(before.credentials.length)
    expect(afterComplete.bindings).toHaveLength(before.bindings.length)
    expect(afterComplete.principals).toHaveLength(before.principals.length)
    expect(afterComplete.ownerships).toHaveLength(before.ownerships.length)
    expect(await listCompletionRows(backend)).toHaveLength(0)
  })

  it('C14: completion does not require or write pending_activation lifecycle', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    expect(await readAccountLifecycle(backend)).toBe('active')

    await completeOnboarding(backend, {
      roleIntent: 'buyer',
      workspaceName: 'Acme Corp',
      correlationRef: correlationRef('c14'),
    })

    expect(await readAccountLifecycle(backend)).toBe('active')
    await expect(backend.run(async (ctx) =>
      ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT_REF))
        .unique())).resolves.toMatchObject({ lifecycle: 'active' })
  })
})
