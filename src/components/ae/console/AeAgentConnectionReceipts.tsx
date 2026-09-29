import { AeFactList } from '@/components/ae/data/AeFactList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatDisplayAmount } from '@/modules/money/public'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'
import {
  authorityFacts,
  connectionStateLabel,
  environmentLabel,
  reconnectInstructionFor,
} from './agent-operator-console-model'

export function AeAgentConnectionReceipts({
  detail,
  lifecyclePending,
  onDisconnect,
}: Readonly<{
  detail: AgentDetail
  lifecyclePending?: Readonly<{ kind: 'credential' | 'connection' | 'agent'; ref: string }>
  onDisconnect: (connection: AgentConnectionReadback, trigger: HTMLButtonElement) => void
}>) {
  if (detail.connectionsAvailable === false) {
    return <p className="text-sm text-muted-foreground">Connection details are unavailable. Refresh Agents to check current connections.</p>
  }
  if (detail.connections.length === 0) {
    return (
      <div className="grid gap-1 rounded-md border border-border p-3">
        <p className="font-medium text-foreground">Direct key</p>
        <p className="text-sm text-muted-foreground">No client connection is recorded for this key. No client identity is inferred.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">Connections</h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {detail.connections.map((connection) => (
          <li key={connection.connectionRef} className="grid gap-3 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">{connection.connectorDisplayName}</p>
              <Badge variant={connection.state === 'active' ? 'default' : 'outline'}>{connectionStateLabel(connection.state)}</Badge>
            </div>
            <AeFactList density="compact" facts={[
              { label: 'Environment', value: environmentLabel(connection.environment) },
              ...authorityFacts(connection.state, connection.authorityMode),
              { label: 'Budget', value: formatDisplayAmount(connection.spendingPolicy.budget.maximumMonthlySpend), mono: true },
              { label: 'Connected', value: formatTimestamp(connection.connectedAt), mono: true },
              { label: 'Last refresh', value: formatTimestamp(connection.lastRotatedAt), mono: true },
              { label: 'Connection expires', value: formatTimestamp(connection.connectionExpiresAt), mono: true },
              { label: 'Last agent use', value: detail.agent.lastSeenAt === undefined ? 'No activity' : formatTimestamp(detail.agent.lastSeenAt), mono: true },
            ]} />
            {connection.state === 'active' ? (
              <Button
                type="button"
                variant="secondary"
                className="w-fit min-h-touch"
                disabled={lifecyclePending !== undefined}
                onClick={(event) => onDisconnect(connection, event.currentTarget)}
              >
                {lifecyclePending?.kind === 'connection' && lifecyclePending.ref === connection.connectionRef ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{reconnectInstructionFor(connection.connectorDisplayName)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
