import { useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Link } from '@tanstack/react-router'

import { AeConnectAgentWizardDialog } from '@/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog'
import { AeKeyRevealDialog } from '@/components/ae/console/AeKeyRevealDialog'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { environmentLabel } from '@/components/ae/console/agent-operator-console-model'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Button } from '@/components/arc/button/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { useTypedReverification } from '@/lib/client/useTypedReverification'
import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { issueAgentAccessKeyServer } from '@/modules/agent-access/agent-access.functions'
import { replaceAgentAccessKeyServer } from '@/modules/agent-access/replace-agent-key.functions'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import type { IssuedAgentAccessReveal } from '@/modules/agent-access/issue-key.contracts'
import type { AgentKeyDraft } from '@/components/ae/console/connect-agent-wizard/agent-key-draft'
import type { ConnectAgentEnvironment, ConnectAgentIssuePhase } from '@/components/ae/console/connect-agent-wizard/connect-agent-wizard.contracts'
import { useAgentKeysSettings } from './useAgentKeysSettings'
import { ApiKeys } from '@/components/ae/shared/arc-pro/api-keys/api-keys'

export type AeAgentKeysSettingsProps = Readonly<{
  deploymentEnvironment: ConnectAgentEnvironment
  initialDirectory: AgentDirectoryProjection
  canonicalBaseUrl: string
  openIssueDialog?: boolean
  draft?: AgentKeyDraft
  onDraftChange?: (draft: AgentKeyDraft) => void
  onWizardOpenChange?: (open: boolean) => void
  resumeTool?: string
  onContinueSetup?: () => void
  onIssuePhaseChange?: (phase: ConnectAgentIssuePhase) => void
}>

export function AeAgentKeysSettings({
  deploymentEnvironment,
  initialDirectory,
  canonicalBaseUrl,
  openIssueDialog = false,
  draft,
  onDraftChange,
  onWizardOpenChange,
  resumeTool,
  onContinueSetup,
  onIssuePhaseChange,
}: AeAgentKeysSettingsProps) {
  const vm = useAgentKeysSettings(initialDirectory)
  const issueRequest = useServerFn(issueAgentAccessKeyServer)
  const issueKey = useTypedReverification(
    issueRequest,
    (result) => result.kind === 'refused' && result.code === 'reverification_required' ? 'strict' : null,
  )
  const replaceRequest = useServerFn(replaceAgentAccessKeyServer)
  const replaceKey = useTypedReverification(
    replaceRequest,
    (result) => result.kind === 'refused' && result.code === 'reverification_required' ? 'strict' : null,
  )
  const [replaceTarget, setReplaceTarget] = useState<{ principalRef: string; name: string; environment: 'sandbox' | 'production'; issuedAt: number }>()
  const [replacing, setReplacing] = useState(false)
  const [replaceError, setReplaceError] = useState<string>()
  const replaceTriggerRef = useRef<HTMLButtonElement>(null)
  async function confirmReplace() {
    if (replaceTarget === undefined || replacing) return
    setReplacing(true)
    try {
      const result = await replaceKey({ data: { principalRef: replaceTarget.principalRef, idempotencyKey: `replace-${globalThis.crypto.randomUUID()}` } })
      if (result.kind === 'created' || result.kind === 'replayed') {
        setReveal({ keyId: result.keyId, secret: result.secret, displayName: replaceTarget.name, environment: replaceTarget.environment })
        setReplaceError(undefined)
      } else setReplaceError('The key was not replaced. Refresh keys and try again.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setReplaceError('The key was not replaced. Refresh keys and try again.')
    } finally {
      setReplaceTarget(undefined)
      setReplacing(false)
      void vm.refresh()
    }
  }
  const [uncontrolledWizardOpen, setUncontrolledWizardOpen] = useState(openIssueDialog)
  const wizardOpen = onWizardOpenChange === undefined ? uncontrolledWizardOpen : openIssueDialog
  const setWizardOpen = (open: boolean) => {
    if (onWizardOpenChange === undefined) setUncontrolledWizardOpen(open)
    else onWizardOpenChange(open)
  }
  const [reveal, setReveal] = useState<IssuedAgentAccessReveal>()
  const keys = vm.directory.details.flatMap((detail) => detail.credentials.map((credential) => ({ detail, credential })))

  // Arc Pro api-keys: retain its header, toolbar, row trigger, facts and revoke
  // regions. The authoritative directory replaces all demo keys and usage.
  // Requires: current server projections and caller-owned issue state.
  // Ensures: each credential has one identified, read-only disclosure row.
  // Invariant: disclosure never fetches, issues or revokes a credential; the
  // existing controller owns revocation, refresh locks and invoking focus.
  // On violation: uncertain revocation/readback keeps changes locked until refresh.
  return <SettingsPage
    title="Agent keys"
    description="Create, replace and revoke the keys your Agents use to connect."
  >
    {resumeTool === undefined ? null : <p>Your selected Tool is saved. After securing the key, return to your Agent’s task for a fresh Quote and first Call.</p>}
    {vm.error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
      {vm.error}<Button type="button" variant="secondary" className="min-h-touch" disabled={vm.loading} onClick={() => void vm.refresh()}>Refresh keys</Button>
    </div>}
    {replaceError && <p role="alert" className="text-sm text-destructive">{replaceError}</p>}
    <ApiKeys
      rows={keys.map(({ detail, credential }) => ({
        id: credential.credentialRef,
        name: detail.agent.displayName,
        environmentLabel: environmentLabel(detail.agent.environment),
        statusLabel: credential.lifecycle === 'active'
          ? credential.credentialRef === detail.currentCredentialRef ? getStatusPresentation('current').label : 'Other active'
          : getStatusPresentation(credential.lifecycle).label,
        active: credential.lifecycle === 'active',
        current: credential.credentialRef === detail.currentCredentialRef,
        issuedLabel: formatTimestamp(credential.issuedAt),
        expiresLabel: formatTimestamp(credential.expiresAt),
        generation: credential.generation,
        credentialReference: credential.credentialRef,
        renderAgentLink: (props) => <Link to="/agent-access" search={{ caller: detail.agent.principalRef }} {...props} />,
        onRequestReplace: (trigger) => {
          replaceTriggerRef.current = trigger
          setReplaceError(undefined)
          setReplaceTarget({ principalRef: detail.agent.principalRef, name: detail.agent.displayName, environment: detail.agent.environment, issuedAt: credential.issuedAt })
        },
        onRequestRevoke: (trigger) => vm.requestRevoke({
          credentialRef: credential.credentialRef,
          generation: credential.generation,
          name: detail.agent.displayName,
          principalRef: detail.agent.principalRef,
          environment: detail.agent.environment,
          current: credential.credentialRef === detail.currentCredentialRef,
          issuedAt: credential.issuedAt,
        }, trigger),
      }))}
      issueDisabled={vm.refreshRequired}
      revokeDisabled={vm.revoking || vm.refreshRequired || replacing}
      onIssue={() => setWizardOpen(true)}
      {...(vm.directory.nextCursor ? { loadMore: { pending: vm.loadingMore, onLoad: () => void vm.loadMore() } } : {})}
    />
    <AeConnectAgentWizardDialog
      deploymentEnvironment={deploymentEnvironment}
      open={wizardOpen}
      onOpenChange={setWizardOpen}
      onIssue={issueKey}
      {...(onIssuePhaseChange === undefined ? {} : { onIssuePhaseChange })}
      onSuccess={(issued) => { setReveal(issued); void vm.refresh() }}
      {...(draft === undefined ? {} : { initialDraft: draft })}
      {...(onDraftChange === undefined ? {} : { onDraftChange })}
    />
    <AeKeyRevealDialog reveal={reveal} open={reveal !== undefined} onOpenChange={(open) => { if (!open) setReveal(undefined) }} canonicalBaseUrl={canonicalBaseUrl}
      {...(onContinueSetup === undefined ? {} : { onContinueSetup })} />
    <AeConfirmDialog
      open={replaceTarget !== undefined}
      onOpenChange={(open) => { if (!open && !replacing) setReplaceTarget(undefined) }}
      title="Replace this key?"
      description={replaceTarget === undefined ? '' : `Create a new key for ${replaceTarget.name} and revoke the key created ${formatTimestamp(replaceTarget.issuedAt)}. The new key is shown once. Update your Agent with it before it makes another request.`}
      confirmLabel="Replace key"
      pending={replacing}
      onConfirm={() => void confirmReplace()}
      returnFocusRef={replaceTriggerRef}
    />
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
