import { reverificationError } from '@clerk/shared/authorization-errors'
import { useRef, useState } from 'react'
import { useReverification } from '@clerk/tanstack-react-start'
import { useServerFn } from '@tanstack/react-start'
import { Link } from '@tanstack/react-router'

import { AeConnectAgentWizardDialog } from '@/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog'
import { AeKeyRevealDialog } from '@/components/ae/console/AeKeyRevealDialog'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { environmentLabel } from '@/components/ae/console/agent-operator-console-model'
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
import type { AgentKeyDraft } from '@/components/ae/console/connect-agent-wizard/agent-key-draft'
import { useAgentKeysSettings } from './useAgentKeysSettings'

export type AeAgentKeysSettingsProps = Readonly<{
  initialDirectory: AgentDirectoryProjection
  canonicalBaseUrl: string
  openIssueDialog?: boolean
  draft?: AgentKeyDraft
  onDraftChange?: (draft: AgentKeyDraft) => void
  onWizardOpenChange?: (open: boolean) => void
}>

export function AeAgentKeysSettings({
  initialDirectory,
  canonicalBaseUrl,
  openIssueDialog = false,
  draft,
  onDraftChange,
  onWizardOpenChange,
}: AeAgentKeysSettingsProps) {
  const vm = useAgentKeysSettings(initialDirectory)
  const reverificationAttempted = useRef(false)
  const issueRequest = useServerFn(issueAgentAccessKeyServer)
  const submitIssueRequest = useReverification(async (args: { data: Record<string, unknown> }) => {
    const result = await issueRequest(args)
    if (result.kind === 'refused' && result.code === 'reverification_required' && !reverificationAttempted.current) {
      reverificationAttempted.current = true
      return reverificationError('strict')
    }
    return result
  })
  const issueKey = async (args: { data: Record<string, unknown> }) => {
    reverificationAttempted.current = false
    return await submitIssueRequest(args)
  }
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
    action={<Button type="button" className="min-h-touch" disabled={vm.refreshRequired} onClick={() => setWizardOpen(true)}>Issue Agent key</Button>}
  >
    {vm.error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
      {vm.error}<Button type="button" variant="outline" disabled={vm.loading} onClick={() => void vm.refresh()}>Refresh keys</Button>
    </div>}
    <SettingsGroup title="Issued keys" description="Keys are listed by Agent. Secrets are shown only once when issued.">
      {keys.length === 0 ? <SettingsEmptyState title="No Agent keys yet" description="Issue a key to connect your first Agent." action={<Button type="button" disabled={vm.refreshRequired} onClick={() => setWizardOpen(true)}>Issue Agent key</Button>} /> : keys.map(({ detail, credential }) => (
        <SettingsRow
          key={credential.credentialRef}
          label={`${detail.agent.displayName} · ${environmentLabel(detail.agent.environment)}`}
          description={`Created ${formatTimestamp(credential.issuedAt)} · expires ${formatTimestamp(credential.expiresAt)}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant={credential.lifecycle === 'active' ? 'default' : 'outline'}>
              {credential.lifecycle === 'active'
                ? credential.credentialRef === detail.currentCredentialRef ? getStatusPresentation('current').label : 'Other active'
                : credential.lifecycle}
            </Badge>
            <Link to="/agent-access" search={{ caller: detail.agent.principalRef }} className="text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring">View Agent</Link>
          </div>
        </SettingsRow>
      ))}
      {vm.directory.nextCursor && <div className="py-4"><Button type="button" variant="outline" disabled={vm.loadingMore} onClick={() => void vm.loadMore()}>{vm.loadingMore ? 'Loading…' : 'Load more keys'}</Button></div>}
    </SettingsGroup>
    {activeKeys.length > 0 && <SettingsDangerZone description="Revoking a key stops new requests made with it. This does not remove the Agent's activity history.">
      {activeKeys.map(({ detail, credential }) => <SettingsRow
        key={credential.credentialRef}
        label={`${detail.agent.displayName} · ${environmentLabel(detail.agent.environment)}`}
        description={credential.credentialRef === detail.currentCredentialRef ? 'In use' : 'Older key'}
      >
        <Button type="button" variant="destructive" className="min-h-touch" disabled={vm.revoking || vm.refreshRequired} aria-label={`Revoke key for ${detail.agent.displayName}`} onClick={(event) => vm.requestRevoke({
          credentialRef: credential.credentialRef,
          generation: credential.generation,
          name: detail.agent.displayName,
          principalRef: detail.agent.principalRef,
          environment: detail.agent.environment,
          current: credential.credentialRef === detail.currentCredentialRef,
        }, event.currentTarget)}>Revoke key</Button>
      </SettingsRow>)}
    </SettingsDangerZone>}
    <AeConnectAgentWizardDialog
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
      description={vm.revokeTarget === undefined ? '' : `Revoke this key for ${vm.revokeTarget.name}? Requests using it stop being authorized. The Agent and its history remain.${vm.revokeTarget.current ? ' If no other key is active the Agent must reconnect.' : ''}`}
      confirmLabel="Revoke this key"
      confirmVariant="destructive"
      pending={vm.revoking}
      onConfirm={() => void vm.confirmRevoke()}
      returnFocusRef={vm.revokeTriggerRef}
    />
  </SettingsPage>
}
