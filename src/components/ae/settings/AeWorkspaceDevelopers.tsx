import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'

export function AeWorkspaceDevelopers() {
  return (
    <AeSection
      title="Keys and machine files"
      description="Caller keys, agent setup, and the public files agents read before they call."
    >
      <div className="grid gap-intra">
        <AeSettingsRow
          title="Keys"
          description="Issue, budget, and revoke agent callers."
          href="/agent-access"
        />
        <AeSettingsRow
          title="Agent setup"
          description="The instruction an agent copies to search, inspect, and call."
          href="/for-agents"
        />
        <AeSettingsRow
          title="llms.txt"
          description="Public Operation index."
          href="/llms.txt"
        />
        <AeSettingsRow
          title="SKILL.md"
          description="Assistant procedure."
          href="/SKILL.md"
        />
        <AeSettingsRow
          title="/.well-known/ucp"
          description="Universal Commerce Protocol discovery."
          href="/.well-known/ucp"
        />
      </div>
    </AeSection>
  )
}
