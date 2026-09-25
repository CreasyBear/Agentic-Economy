import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Link } from '@tanstack/react-router'

import { AeConnectAgentWizardDialog } from '@/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog'
import { AeKeyRevealDialog } from '@/components/ae/console/AeKeyRevealDialog'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import {
  SettingsDangerZone, SettingsEmptyState, SettingsGroup, SettingsPage, SettingsRow,
} from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { issueAgentAccessKeyServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import type { IssuedAgentAccessReveal } from '@/modules/agent-access/issue-key.contracts'
import { CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS } from '@/components/ae/console/connect-agent-wizard/useConnectAgentWizard'
import { useAgentKeysSettings } from './useAgentKeysSettings'

export type AeAgentKeysSettingsProps = Readonly<{
  initialDirectory: AgentDirectoryProjection
  canonicalBaseUrl: string
}>

export function AeAgentKeysSettings({ initialDirectory, canonicalBaseUrl }: AeAgentKeysSettingsProps) {
  const vm = useAgentKeysSettings(initialDirectory)
  const issueKey = useServerFn(issueAgentAccessKeyServer)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [reveal, setReveal] = useState<IssuedAgentAccessReveal>()
  const keys = vm.directory.details.flatMap((detail) => detail.credentials.map((credential) => ({ detail, credential })))
  const activeKeys = keys.filter(({ credential }) => credential.lifecycle === 'active')

  return <SettingsPage
    title="Agent keys"
    description="Issue and revoke credentials that let Agents act within their own access policy."
    action={<Button type="button" className="min-h-touch" disabled={vm.refreshRequired} onClick={() => setWizardOpen(true)}>Issue Agent key</Button>}
  >
    {vm.error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
      {vm.error}<Button type="button" variant="outline" disabled={vm.loading} onClick={() => void vm.refresh()}>Refresh keys</Button>
    </div>}
    <SettingsGroup title="Default issue policy" description="Review and change limits for each new key before issuing it.">
      <SettingsRow label="Starting environment" description="A new key starts in sandbox; choose production in the issue dialog when needed.">
        <Badge variant="secondary">Sandbox</Badge>
      </SettingsRow>
      <SettingsRow label="Starting authority" description="Spending policy is selected by default. Production limits are set per Agent when issued.">
        <span>Spending policy</span>
      </SettingsRow>
      <SettingsRow label="Starting production limits" description="Review per-call, daily and monthly limits before issuing a production key.">
        <span>A${CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS.perCall} / call · A${CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS.daily} / day · A${CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS.monthly} / month</span>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup title="Issued keys" description="Keys are listed by Agent. Secrets are shown only once when issued.">
      {keys.length === 0 ? <SettingsEmptyState title="No Agent keys yet" description="Issue a key to connect your first Agent." action={<Button type="button" disabled={vm.refreshRequired} onClick={() => setWizardOpen(true)}>Issue Agent key</Button>} /> : keys.map(({ detail, credential }) => (
        <SettingsRow
          key={credential.credentialRef}
          label={`${detail.agent.displayName} · generation ${credential.generation}`}
          description={`Issued ${formatTimestamp(credential.issuedAt)} · expires ${formatTimestamp(credential.expiresAt)}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant={credential.lifecycle === 'active' ? 'default' : 'outline'}>
              {credential.lifecycle === 'active' && credential.credentialRef === detail.currentCredentialRef ? getStatusPresentation('current').label : credential.lifecycle}
            </Badge>
            <Link to="/agent-access" search={{ caller: detail.agent.principalRef }} className="text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand">View Agent</Link>
          </div>
          <p className="mt-1 break-all text-xs text-muted-foreground">{credential.credentialRef}</p>
        </SettingsRow>
      ))}
      {vm.directory.nextCursor && <div className="py-4"><Button type="button" variant="outline" disabled={vm.loadingMore} onClick={() => void vm.loadMore()}>{vm.loadingMore ? 'Loading…' : 'Load more keys'}</Button></div>}
    </SettingsGroup>
    {activeKeys.length > 0 && <SettingsDangerZone description="Revoking a key stops new requests made with it. This does not remove the Agent's activity history.">
      {activeKeys.map(({ detail, credential }) => <SettingsRow
        key={credential.credentialRef}
        label={`${detail.agent.displayName} · generation ${credential.generation}`}
        description="Stops new requests made with this credential."
      >
        <Button type="button" variant="destructive" className="min-h-touch" disabled={vm.revoking || vm.refreshRequired} onClick={(event) => vm.requestRevoke(credential.credentialRef, detail.agent.displayName, event.currentTarget)}>Revoke key</Button>
      </SettingsRow>)}
    </SettingsDangerZone>}
    <AeConnectAgentWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} onIssue={issueKey} onSuccess={(issued) => { setReveal(issued); void vm.refresh() }} />
    <AeKeyRevealDialog reveal={reveal} open={reveal !== undefined} onOpenChange={(open) => { if (!open) setReveal(undefined) }} canonicalBaseUrl={canonicalBaseUrl} />
    <AeConfirmDialog
      open={vm.revokeTarget !== undefined}
      onOpenChange={vm.closeRevoke}
      title="Revoke Agent key?"
      description={`New requests using ${vm.revokeTarget?.name ?? 'this Agent'}'s selected key will stop. Existing activity remains available.`}
      confirmLabel="Revoke key"
      confirmVariant="destructive"
      pending={vm.revoking}
      onConfirm={() => void vm.confirmRevoke()}
      returnFocusRef={vm.revokeTriggerRef}
    />
  </SettingsPage>
}
