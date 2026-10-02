import { Link } from '@tanstack/react-router'

import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import './AgentApprovalComposition.css'

export function AeAgentAuthorizedTools({ detail }: Readonly<{ detail: AgentDetail }>) {
  if (detail.grant?.toolAccess !== 'selected_tools' || detail.grant.toolRefs.length === 0) {
    return null
  }
  return (
    <div className="arc-market arc-agent-approvals__authorized">
      <h3 className="text-sm font-medium text-foreground">Authorized Tools</h3>
      <ul className="arc-agent-approvals__authorized-list">
        {detail.grant.toolRefs.map((toolRef) => (
          <li key={toolRef} className="arc-agent-approvals__authorized-item">
            <Link
              to="/tools/$toolRef"
              params={{ toolRef }}
              className="arc-agent-approvals__authorized-link"
            >
              {toolRef}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
