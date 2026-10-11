import { readWorkspaceTerminalReceipt } from './workspace-terminal-receipt'
import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceAction, callSourceMutation, callSourceQuery, sourceAction, sourceMutation, sourceQuery, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { readClerkMfaConsequenceProof, type ClerkMfaConsequenceProofInput } from '@/lib/server/clerk-consequence-proof'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import type { WorkspaceCloseBlockedRefusal, WorkspaceCloseCommand, WorkspaceCloseResult, WorkspaceTransferCommand, WorkspaceTransferResult } from '@/modules/principal-account/workspace-decommission.view-model'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { unboundWorkspaceDefaultName } from '@/lib/workspace-label'

export type WorkspaceOrganizationBinding = Readonly<{
  accountRef: string
  displayName: string
  accountRevision: number
  callerIsOwner: boolean
  clerkOrgId: string | null
  ownerDisplayName: string
  ownerClerkUserId: string | null
}>
const readWorkspaceOrganizationBinding = sourceQuery<Record<string, never>, WorkspaceOrganizationBinding>(
  'workspaceAccounts:readWorkspaceOrganizationBinding',
)

const renameSchema = z.strictObject({
  expectedAccountRef: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200).regex(/^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u),
})
export const readPersonalWorkspaceDefaultNameServer = createServerFn().handler(async (): Promise<string | null> =>
  readPersonalWorkspaceDefaultNameThroughSource())

export async function readPersonalWorkspaceDefaultNameThroughSource(
  transport?: ConvexSourceTransport, signal?: AbortSignal,
): Promise<string | null> {
  signal?.throwIfAborted()
  const binding = await (transport === undefined ? callSourceQuery(readWorkspaceOrganizationBinding, {})
    : transport.query(readWorkspaceOrganizationBinding, {}))
  signal?.throwIfAborted()
  const needsClerkName = binding.clerkOrgId === null
    && binding.displayName.startsWith('user_')
    && binding.ownerDisplayName.startsWith('user_')
    && binding.ownerClerkUserId !== null
  const clerkPersonName = needsClerkName
    ? await clerkPersonLabel(binding.ownerClerkUserId)
    : null
  return unboundWorkspaceDefaultName({
    clerkOrgId: binding.clerkOrgId,
    displayName: binding.displayName,
    ownerDisplayName: binding.ownerDisplayName,
    clerkPersonName,
  })
}

async function clerkPersonLabel(userId: string | null): Promise<string | null> {
  if (userId === null) return null
  const owner = await clerkClient().users.getUser(userId)
  const displayName = [owner.firstName, owner.lastName].filter(Boolean).join(' ')
    || owner.username || owner.emailAddresses[0]?.emailAddress.split('@')[0]
  return displayName && displayName.length > 0 ? displayName : null
}

type RenameWorkspaceResult =
  | Readonly<{ kind: 'accepted'; name: string }>
  | Readonly<{ kind: 'refused'; code: 'forbidden' | 'source_unavailable' }>

/** A Clerk rename is the sole writer; its webhook advances the AE account name. */
export async function renameWorkspaceThroughClerk(
  name: string,
  expectedAccountRef: string,
  activeOrgId: string | null | undefined,
  readBinding: () => Promise<WorkspaceOrganizationBinding>,
  updateOrganization: (organizationId: string, name: string) => Promise<void>,
): Promise<RenameWorkspaceResult> {
  if (!activeOrgId) return { kind: 'refused', code: 'forbidden' }
  const binding = await readBinding()
  if (binding.accountRef !== expectedAccountRef || !binding.callerIsOwner || binding.clerkOrgId !== activeOrgId) {
    return { kind: 'refused', code: 'forbidden' }
  }
  if (binding.displayName !== name) await updateOrganization(activeOrgId, name)
  return { kind: 'accepted', name }
}

export const renameWorkspaceServer = createServerFn({ method: 'POST' })
  .validator((data) => renameSchema.parse(data))
  .handler(async ({ data }): Promise<RenameWorkspaceResult> => {
    const session = await auth()
    if (!session.isAuthenticated || !session.userId) return { kind: 'refused', code: 'forbidden' }
    try {
      return await renameWorkspaceThroughClerk(
        data.name,
        data.expectedAccountRef,
        session.orgId,
        () => callSourceQuery(readWorkspaceOrganizationBinding, {}),
        async (organizationId, name) => { await clerkClient().organizations.updateOrganization(organizationId, { name }) },
      )
    } catch (cause) {
      captureRouteException(cause, { site: 'renameWorkspaceServer' })
      return { kind: 'refused', code: 'source_unavailable' }
    }
  })

type WorkspaceActionWire = Readonly<{
  operationKey: string; correlationId: string; proof?: ClerkMfaConsequenceProofInput
  sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest
}>
const closeWorkspaceMutation = sourceMutation<WorkspaceCloseCommand & WorkspaceActionWire, WorkspaceCloseResult>('workspaceAccounts:closeWorkspace')
const readCreditAccountAction = sourceAction<{ principalId: string; currency: string }, { kind: 'ok'; purchasedBalance: { units: string } } | { kind: 'refused'; code: string }>('moneyLedger:readCreditAccount')

/** Credit lives in the ledger, which a mutation cannot read, so close is refused here while purchased credit remains. Promotional credit is not withdrawable and does not block. */
async function creditCloseRefusal(accountRef: string): Promise<WorkspaceCloseBlockedRefusal | null> {
  try {
    const account = await callSourceAction(readCreditAccountAction, { principalId: accountRef, currency: 'AUD' })
    if (account.kind !== 'ok') return { kind: 'refused', code: 'source_unavailable' }
    return BigInt(account.purchasedBalance.units) > 0n ? { kind: 'refused', code: 'positive_credit_balance' } : null
  } catch (cause) {
    captureRouteException(cause, { site: 'closeWorkspaceServer.creditBalance' })
    return { kind: 'refused', code: 'source_unavailable' }
  }
}
const transferWorkspaceMutation = sourceMutation<WorkspaceTransferCommand & WorkspaceActionWire, WorkspaceTransferResult>('workspaceAccounts:transferWorkspaceOwnership')
const workspaceActionFields = {
  expectedAccountRef: z.string().min(1).max(200),
  expectedAccountRevision: z.number().int().nonnegative(), expectedOwnershipRevision: z.number().int().nonnegative(),
  correlationRef: z.string().min(1).max(200), idempotencyRef: z.string().min(1).max(200),
}

async function workspaceActionWire<T extends WorkspaceCloseCommand | WorkspaceTransferCommand>(
  data: T, context: unknown,
): Promise<T & WorkspaceActionWire> {
  const proof = await readClerkMfaConsequenceProof()
  const command = { ...data, operationKey: data.idempotencyRef, correlationId: data.correlationRef,
    ...(proof === undefined ? {} : { proof }) }
  const sourceWrite = await sourceWriteAdmissionFromContext({ context, command,
    scope: 'protected_action', operationKey: command.operationKey, correlationId: command.correlationId })
  return { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) }
}

export const closeWorkspaceServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ ...workspaceActionFields, confirmationName: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data, context }): Promise<WorkspaceCloseResult> => {
    const receipt = await readWorkspaceTerminalReceipt({ action: 'close', ...data })
    if (receipt?.action === 'close') return { kind: receipt.kind, accountRef: receipt.accountRef, accountRevision: receipt.accountRevision }
    const refusal = await creditCloseRefusal(data.expectedAccountRef)
    if (refusal !== null) return refusal
    return await callSourceMutation(closeWorkspaceMutation, await workspaceActionWire(data, context))
  })

export const transferWorkspaceOwnershipServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ ...workspaceActionFields, successorPrincipalRef: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data, context }): Promise<WorkspaceTransferResult> => {
    const receipt = await readWorkspaceTerminalReceipt({ action: 'transfer', ...data })
    if (receipt?.action === 'transfer') return { kind: receipt.kind, accountRef: receipt.accountRef, accountRevision: receipt.accountRevision, currentOwnershipRef: receipt.currentOwnershipRef }
    return await callSourceMutation(transferWorkspaceMutation, await workspaceActionWire(data, context))
  })
