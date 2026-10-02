import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Link } from '@tanstack/react-router'

import { AeConnectAgentWizardDialog } from '@/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog'
import { AeKeyRevealDialog } from '@/components/ae/console/AeKeyRevealDialog'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { environmentLabel } from '@/components/ae/console/agent-operator-console-model'
import {
  SettingsDangerZone, SettingsEmptyState, SettingsGroup, SettingsPage,
} from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Button } from '@/components/arc/button/button'
import { useTypedReverification } from '@/lib/client/useTypedReverification'
import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { issueAgentAccessKeyServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import type { IssuedAgentAccessReveal } from '@/modules/agent-access/issue-key.contracts'
import type { AgentKeyDraft } from '@/components/ae/console/connect-agent-wizard/agent-key-draft'
import type { ConnectAgentEnvironment } from '@/components/ae/console/connect-agent-wizard/connect-agent-wizard.contracts'
import { useAgentKeysSettings } from './useAgentKeysSettings'
import './AgentKeysComposition.css'

export type AeAgentKeysSettingsProps = Readonly<{
  deploymentEnvironment: ConnectAgentEnvironment
  initialDirectory: AgentDirectoryProjection
  canonicalBaseUrl: string
  openIssueDialog?: boolean
  draft?: AgentKeyDraft
  onDraftChange?: (draft: AgentKeyDraft) => void
  onWizardOpenChange?: (open: boolean) => void
}>

export function AeAgentKeysSettings({
  deploymentEnvironment,
  initialDirectory,
  canonicalBaseUrl,
  openIssueDialog = false,
  draft,
  onDraftChange,
  onWizardOpenChange,
}: AeAgentKeysSettingsProps) {
  const vm = useAgentKeysSettings(initialDirectory)
  const issueRequest = useServerFn(issueAgentAccessKeyServer)
  const issueKey = useTypedReverification(
    issueRequest,
    (result) => result.kind === 'refused' && result.code === 'reverification_required' ? 'strict' : null,
  )
  const [uncontrolledWizardOpen, setUncontrolledWizardOpen] = useState(openIssueDialog)
  const wizardOpen = onWizardOpenChange === undefined ? uncontrolledWizardOpen : openIssueDialog
  const setWizardOpen = (open: boolean) => {
    if (onWizardOpenChange === undefined) setUncontrolledWizardOpen(open)
    else onWizardOpenChange(open)
  }
  const [reveal, setReveal] = useState<IssuedAgentAccessReveal>()
  const keys = vm.directory.details.flatMap((detail) => detail.credentials.map((credential) => ({ detail, credential })))
  const activeKeys = keys.filter(({ credential }) => credential.lifecycle === 'active')

  return <SettingsPage
    title="Agent keys"
    description="Create and revoke the keys your Agents use to connect."
    action={<Button type="button" variant="primary" className="min-h-touch" disabled={vm.refreshRequired} onClick={() => setWizardOpen(true)}>Issue Agent key</Button>}
  >
    {vm.error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
      {vm.error}<Button type="button" variant="secondary" className="min-h-touch" disabled={vm.loading} onClick={() => void vm.refresh()}>Refresh keys</Button>
    </div>}
    <SettingsGroup title="Issued keys" description="Keys are listed by Agent. Secrets are shown only once when issued.">
      {keys.length === 0 ? <SettingsEmptyState title="No Agent keys yet" description="Issue a key to connect your first Agent." action={<Button type="button" variant="secondary" className="min-h-touch" disabled={vm.refreshRequired} onClick={() => setWizardOpen(true)}>Issue Agent key</Button>} /> : (
        <ul className="arc-market arc-key-list" aria-label="Issued Agent keys">
          {keys.map(({ detail, credential }) => (
            <li key={credential.credentialRef} className="arc-key-row arc-key-row-inner">
              <div className="arc-key-identity">
                <div className="arc-key-name-line">
                  <h4 className="arc-key-name">{`${detail.agent.displayName} · ${environmentLabel(detail.agent.environment)}`}</h4>
                </div>
                <p className="arc-key-dates">{`Created ${formatTimestamp(credential.issuedAt)} · expires ${formatTimestamp(credential.expiresAt)}`}</p>
              </div>
              <div className="arc-key-actions">
                <span className="arc-key-state" data-active={credential.lifecycle === 'active'}>
                  {credential.lifecycle === 'active'
                    ? credential.credentialRef === detail.currentCredentialRef ? getStatusPresentation('current').label : 'Other active'
                    : credential.lifecycle}
                </span>
                <Link to="/agent-access" search={{ caller: detail.agent.principalRef }} className="arc-key-link">View Agent</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {vm.directory.nextCursor && <div className="py-4"><Button type="button" variant="secondary" className="min-h-touch" disabled={vm.loadingMore} onClick={() => void vm.loadMore()}>{vm.loadingMore ? 'Loading…' : 'Load more keys'}</Button></div>}
    </SettingsGroup>
    {activeKeys.length > 0 && <SettingsDangerZone description="Revoking a key stops new requests made with it. This does not remove the Agent's activity history.">
      <ul className="arc-market arc-key-list arc-key-danger-list" aria-label="Active Agent keys that can be revoked">
        {activeKeys.map(({ detail, credential }) => <li key={credential.credentialRef} className="arc-key-row arc-key-row-inner">
          <div className="arc-key-identity">
            <div className="arc-key-name-line">
              <h4 className="arc-key-name">{`${detail.agent.displayName} · ${environmentLabel(detail.agent.environment)}`}</h4>
            </div>
            <p className="arc-key-dates">{`Created ${formatTimestamp(credential.issuedAt)} · ${credential.credentialRef === detail.currentCredentialRef ? 'In use' : 'Older key'}`}</p>
          </div>
          <div className="arc-key-actions">
            <Button type="button" variant="danger" className="min-h-touch" disabled={vm.revoking || vm.refreshRequired} aria-label={`Revoke key created ${formatTimestamp(credential.issuedAt)} for ${detail.agent.displayName}`} onClick={(event) => vm.requestRevoke({
              credentialRef: credential.credentialRef,
              generation: credential.generation,
              name: detail.agent.displayName,
              principalRef: detail.agent.principalRef,
              environment: detail.agent.environment,
              current: credential.credentialRef === detail.currentCredentialRef,
              issuedAt: credential.issuedAt,
            }, event.currentTarget)}>Revoke key</Button>
          </div>
        </li>)}
      </ul>
    </SettingsDangerZone>}
    <AeConnectAgentWizardDialog
      deploymentEnvironment={deploymentEnvironment}
      open={wizardOpen}
      onOpenChange={setWizardOpen}
      onIssue={issueKey}
      onSuccess={(issued) => { setReveal(issued); void vm.refresh() }}
      {...(draft === undefined ? {} : { initialDraft: draft })}
      {...(onDraftChange === undefined ? {} : { onDraftChange })}
    />
    <AeKeyRevealDialog reveal={reveal} open={reveal !== undefined} onOpenChange={(open) => { if (!open) setReveal(undefined) }} canonicalBaseUrl={canonicalBaseUrl} />
    <AeConfirmDialog
      open={vm.revokeTarget !== undefined}
      onOpenChange={vm.closeRevoke}
      title="Revoke this key?"
      description={vm.revokeTarget === undefined ? '' : `Revoke the key created ${formatTimestamp(vm.revokeTarget.issuedAt)} for ${vm.revokeTarget.name}? Requests using it stop being authorized. The Agent and its history remain.${vm.revokeTarget.current ? ' If no other key is active the Agent must reconnect.' : ''}`}
      confirmLabel="Revoke this key"
      confirmVariant="destructive"
      pending={vm.revoking}
      onConfirm={() => void vm.confirmRevoke()}
      returnFocusRef={vm.revokeTriggerRef}
    />
  </SettingsPage>
}
