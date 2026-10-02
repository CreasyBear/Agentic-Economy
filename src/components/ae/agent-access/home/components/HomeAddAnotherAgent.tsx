import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'

import type { HomeAddAnotherAgentProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

export function HomeAddAnotherAgent({
  showSetup,
  toggleLabel,
  onToggle,
  installPanel,
}: HomeAddAnotherAgentProps) {
  return (
    <AeSection className="arc-agent-add-section" title="Add another Agent" description="Existing Agents remain connected until expiry or until you disconnect them.">
      <Button type="button" variant="secondary" className="arc-agent-inline-action" onClick={onToggle}>
        {toggleLabel}
      </Button>
      {showSetup ? installPanel : null}
    </AeSection>
  )
}
