import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'

import type { HomeAddAnotherAgentProps } from '../agent-access-home.contracts'

export function HomeAddAnotherAgent({
  showSetup,
  toggleLabel,
  onToggle,
  installPanel,
}: HomeAddAnotherAgentProps) {
  return (
    <AeSection title="Add another Agent" description="Existing Agents remain connected until expiry or until you disconnect them.">
      <Button type="button" variant="secondary" className="w-fit min-h-touch" onClick={onToggle}>
        {toggleLabel}
      </Button>
      {showSetup ? installPanel : null}
    </AeSection>
  )
}
