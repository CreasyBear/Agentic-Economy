import { Link } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'

export function AeWorkspaceMembers({
  items,
  loading = false,
  unavailable = false,
}: Readonly<{
  items: readonly AgentOperatorKeyReadback[]
  loading?: boolean
  unavailable?: boolean
}>) {
  return (
    <>
      <AeSection
        title="Human operators"
        description="This workspace is owned by the signed-in operator. Additional human memberships are not listed yet."
      >
        <div className="grid gap-intra">
          <AeSettingsRow
            title="Owner"
            description="Profile, email, security, and sessions for the signed-in operator."
            href="/owner/settings"
          />
        </div>
      </AeSection>
      <AeSection
        title="Agent callers"
        description="Agents call as Keys issued to this owner. Issue, budget, and revoke on Keys."
      >
        {unavailable ? (
          <AeEmptyState
            title="Agent callers are unavailable"
            description="Try Keys in a moment. If this keeps happening, use Help & corrections."
            role="alert"
            action={
              <Button asChild variant="secondary" className="min-h-touch">
                <Link to="/agent-access">Open Keys</Link>
              </Button>
            }
          />
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading agent callers…</p>
        ) : items.length === 0 ? (
          <AeEmptyState
            title="No agent is connected yet"
            description="Start setup from the agent and approve the request to create access you can revoke."
            action={
              <Button asChild className="min-h-touch">
                <Link to="/agent-access">Open Keys</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-intra">
            {items.map((item) => (
              <AeSettingsRow
                key={item.key.keyId}
                title={item.key.name}
                description={agentCallerDescription(item)}
                href="/agent-access"
              />
            ))}
            <Button asChild variant="secondary" className="min-h-touch justify-self-start">
              <Link to="/agent-access">Manage on Keys</Link>
            </Button>
          </div>
        )}
      </AeSection>
    </>
  )
}

function agentCallerDescription(item: AgentOperatorKeyReadback): string {
  const lifecycle = item.grant?.lifecycle
    ?? (item.key.revoked ? 'revoked' : item.key.expired ? 'expired' : 'active')
  return `${lifecycle} · ${item.key.environment} · ${item.principalId}`
}
