import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { Button } from '@/components/arc/button/button'

import type { HomeEmptyInstallPanelProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

export function HomeEmptyInstallPanel({
  canonicalBaseUrl,
  checkingConnection,
  resumeToolRef,
  onCheckConnection,
  onConnectNewAgent,
}: HomeEmptyInstallPanelProps) {
  return (
    <div className="arc-market arc-agent-empty-install">
      <div className="arc-agent-home-actions">
        <Button type="button" onClick={onConnectNewAgent} className="arc-agent-inline-action">
          Choose how to connect
        </Button>
      </div>
      <AeAssistantInstallFunnel
        canonicalBaseUrl={canonicalBaseUrl}
        checkingConnection={checkingConnection}
        onCheckConnection={onCheckConnection}
        hideSelfLinks
        {...(resumeToolRef === undefined ? {} : { resumeToolRef })}
      />
    </div>
  )
}
