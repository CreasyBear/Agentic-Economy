import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { Button } from '@/components/ui/button'

import type { HomeEmptyInstallPanelProps } from '../agent-access-home.contracts'

export function HomeEmptyInstallPanel({
  canonicalBaseUrl,
  checkingConnection,
  resumeToolRef,
  onCheckConnection,
  onConnectNewAgent,
}: HomeEmptyInstallPanelProps) {
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={onConnectNewAgent} className="w-fit min-h-touch">
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
