import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { AeAgentKeysSettings } from '@/components/ae/settings/agent-keys/AeAgentKeysSettings'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import {
  AGENT_KEY_DRAFT_DEFAULTS,
  agentKeyDraftFromSearch,
  isAgentKeyDraftDirty,
  navigateAgentKeyIssueSearch,
  validateAgentKeyIssueSearch,
  type AgentKeyDraft,
} from '@/components/ae/console/connect-agent-wizard/agent-key-draft'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/agent-keys')({
  ...operatorRouteOptions,
  validateSearch: validateAgentKeyIssueSearch,
  loader: async () => {
    const [directory, canonicalBaseUrl] = await Promise.all([
      readAgentDirectoryServer(),
      readCanonicalBaseUrlServer(),
    ])
    return { directory, canonicalBaseUrl }
  },
  head: () => ({ meta: [
    { title: 'Agent keys | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentKeysRoute,
})

function AgentKeysRoute() {
  const { directory, canonicalBaseUrl } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const anchorRef = useRef<HTMLDivElement>(null)
  const searchDraft = agentKeyDraftFromSearch(search)
  const [pendingDraft, setPendingDraft] = useState<AgentKeyDraft | null>(null)
  const open = search.issue === 'manual'
  const liveDraft = pendingDraft ?? searchDraft

  useEffect(() => {
    setPendingDraft(null)
  }, [search.issue, search.name, search.env, search.authority, search.perCall, search.daily, search.monthly])

  return (
    <AeNavigationSafetyBoundary
      state={{ dirty: open && isAgentKeyDraftDirty(liveDraft), pending: false, saveOutcome: 'idle' }}
      title="Leave without issuing this key?"
      pendingTitle="Issuing this key"
      description="The name and limits are only on this page. Leaving discards them. No key has been issued."
      pendingDescription="Wait until issuance finishes before leaving."
      saveActionRef={anchorRef}
      headingRef={anchorRef}
    >
      <div ref={anchorRef}>
        <AeAgentKeysSettings
          initialDirectory={directory}
          canonicalBaseUrl={canonicalBaseUrl}
          openIssueDialog={open}
          draft={liveDraft}
          onDraftChange={(next) => {
            setPendingDraft(next)
            navigateAgentKeyIssueSearch(navigate, true, next, true)
          }}
          onWizardOpenChange={(nextOpen) => {
            const nextDraft = nextOpen ? liveDraft : AGENT_KEY_DRAFT_DEFAULTS
            setPendingDraft(nextOpen ? null : AGENT_KEY_DRAFT_DEFAULTS)
            navigateAgentKeyIssueSearch(navigate, nextOpen, nextDraft, !nextOpen)
          }}
        />
      </div>
    </AeNavigationSafetyBoundary>
  )
}
