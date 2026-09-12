import { Link } from '@tanstack/react-router'

import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'

export function AeAgentAuthorizedTools({ detail }: Readonly<{ detail: AgentDetail }>) {
  if (detail.grant?.toolAccess !== 'selected_tools' || detail.grant.toolRefs.length === 0) {
    return null
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">Authorized Tools</h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {detail.grant.toolRefs.map((toolRef) => (
          <li key={toolRef} className="min-w-0 rounded-md border px-3 py-2">
            <Link
              to="/tools/$toolRef"
              params={{ toolRef }}
              className="block truncate font-mono text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {toolRef}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
