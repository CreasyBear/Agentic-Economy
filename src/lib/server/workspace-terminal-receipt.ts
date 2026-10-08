import { auth } from '@clerk/tanstack-react-start/server'
import { ConvexHttpClient } from 'convex/browser'
import { sourceQuery, readRequiredConvexAuthToken, readRequiredConvexUrl, type CreateAuthenticatedConvexClientOptions } from './convex-source'
import type { WorkspaceCloseCommand, WorkspaceTransferCommand } from '@/modules/principal-account/workspace-decommission.view-model'

type TerminalCommand = ({ action: 'close' } & WorkspaceCloseCommand) | ({ action: 'transfer' } & WorkspaceTransferCommand)
type TerminalReceipt = null | Readonly<{ kind: 'replayed'; action: 'close'; accountRef: string; accountRevision: number }>
  | Readonly<{ kind: 'replayed'; action: 'transfer'; accountRef: string; accountRevision: number; currentOwnershipRef: string }>
const receiptRead = sourceQuery<{ command: TerminalCommand }, TerminalReceipt>('workspaceAccounts:readWorkspaceTerminalReceipt')

/** Closed-account recovery authenticates identity, never arms or bypasses a write. */
export async function readWorkspaceTerminalReceipt(command: TerminalCommand,
  options: CreateAuthenticatedConvexClientOptions = {}): Promise<TerminalReceipt> {
  const session = options.authObject ?? await auth()
  const client = new ConvexHttpClient(readRequiredConvexUrl(options.env), {
    auth: await readRequiredConvexAuthToken(session, options.tokenTemplate),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.skipConvexDeploymentUrlCheck === undefined ? {} : { skipConvexDeploymentUrlCheck: options.skipConvexDeploymentUrlCheck }),
  })
  // This client is private to one exact read; fresh operations use the normal materialized transport.
  return await client.query(receiptRead, { command })
}
