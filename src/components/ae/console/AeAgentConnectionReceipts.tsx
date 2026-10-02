import { AeFactList } from '@/components/ae/data/AeFactList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/arc/button/button'
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
import './AgentConnectionRecordsComposition.css'

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
    return <p className="arc-market aeAgentConnectionUnavailable">Connection details are unavailable. Refresh Agents to check current connections.</p>
  }
  if (detail.connections.length === 0) {
    return (
      <div className="arc-market aeAgentConnectionDirectKey">
        <p className="aeAgentConnectionDirectKeyTitle">Direct key</p>
        <p className="aeAgentConnectionDirectKeyDescription">No client connection is recorded for this key. No client identity is inferred.</p>
      </div>
    )
  }
  return (
    <section className="arc-market aeAgentConnectionReceipts">
      <h3 className="aeAgentConnectionHeading">Connections</h3>
      <ul className="aeAgentConnectionList">
        {detail.connections.map((connection) => (
          <li key={connection.connectionRef} className="aeAgentConnectionRow">
            <div className="aeAgentConnectionHeader">
              <p className="aeAgentConnectionName">{connection.connectorDisplayName}</p>
              <Badge variant={connection.state === 'active' ? 'default' : 'outline'}>{connectionStateLabel(connection.state)}</Badge>
            </div>
            <AeFactList className="aeAgentConnectionFacts" density="compact" facts={[
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
                className="aeAgentConnectionDisconnect"
                disabled={lifecyclePending !== undefined}
                onClick={(event) => onDisconnect(connection, event.currentTarget)}
              >
                {lifecyclePending?.kind === 'connection' && lifecyclePending.ref === connection.connectionRef ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            ) : (
              <p className="aeAgentConnectionReconnect">{reconnectInstructionFor(connection.connectorDisplayName)}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
