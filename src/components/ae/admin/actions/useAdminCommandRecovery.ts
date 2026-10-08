import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import {
  adminCommandRecoveryScope, forgetAdminCommandRecovery, readAdminCommandRecovery,
  subscribeAdminCommandRecovery, type AdminCommandRecoveryIdentity,
} from './admin-command-recovery'

/** Mount in the admin surface. Actor changes synchronously hide the previous actor's entries.
 * Loading/access loss hides entries without deleting recovery identities. */
export function useAdminCommandRecovery() {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const scope = access?.kind === 'allowed' ? adminCommandRecoveryScope(access.actorRef) : null
  const [snapshot, setSnapshot] = useState<{ scope: string | null; entries: readonly AdminCommandRecoveryIdentity[] }>({ scope: null, entries: [] })
  useEffect(() => {
    const refresh = () => setSnapshot({ scope, entries: scope === null ? [] : readAdminCommandRecovery(scope) })
    refresh()
    return subscribeAdminCommandRecovery(refresh)
  }, [scope])
  return { scope, entries: scope === snapshot.scope ? snapshot.entries : [] }
}

/** Receipt observation is reactive and read-only; restoring this hook never sends a command. */
export function useAdminCommandObservation(scope: string | null, identity: AdminCommandRecoveryIdentity) {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const currentScope = access?.kind === 'allowed' ? adminCommandRecoveryScope(access.actorRef) : null
  const active = scope !== null && scope === currentScope
  const observation = useQuery(api.adminConsoleAudit.readAdminCommandReceipt, active ? identity : 'skip')
  const visible = active ? observation : undefined
  const terminal = visible?.kind === 'recorded' && visible.receipt.kind !== 'pending'
    && visible.receipt.action === identity.action && visible.receipt.correlationId === identity.correlationId
  return {
    identity,
    observation: visible,
    canAcknowledge: terminal,
    acknowledge: () => terminal && scope !== null ? forgetAdminCommandRecovery(scope, identity) : false,
  }
}
