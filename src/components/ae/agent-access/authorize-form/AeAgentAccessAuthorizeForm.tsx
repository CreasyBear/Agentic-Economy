import { useEffect } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection, AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { AgentAccessAuthorizeFormDetails, ConsentLocator } from '@/modules/agent-access/consent.contracts'

import { AuthorityModeRadioGroup } from './components/AuthorityModeRadioGroup'
import { ConsentConnectionFieldset } from './components/ConsentConnectionFieldset'
import { ConsentDecisionBar } from './components/ConsentDecisionBar'
import { ConsentOutcomeView } from './components/ConsentOutcomeView'
import { ConsentRequestFacts } from './components/ConsentRequestFacts'
import { ConsentToolAccessFieldset } from './components/ConsentToolAccessFieldset'
import { useAgentConsentDecision } from './useAgentConsentDecision'
import './ConsentComposition.css'

export type AeAgentAccessAuthorizeFormProps = Readonly<{
  locator: ConsentLocator
  oauthState?: string
  details: AgentAccessAuthorizeFormDetails
}>

export function AeAgentAccessAuthorizeForm({ locator, oauthState, details }: AeAgentAccessAuthorizeFormProps) {
  const vm = useAgentConsentDecision({ locator, details, ...(oauthState === undefined ? {} : { oauthState }) })
  const authorizeRecoverySearch = {
    grant_ref: vm.grantRef,
    ...(oauthState === undefined ? {} : { state: oauthState }),
  }
  const decisionBar = (
    <ConsentDecisionBar
      approveButtonRef={vm.approveButtonRef}
      pending={vm.pending}
      connectionTarget={vm.connectionTarget}
      replacementMode={vm.replacementMode}
      agentTargetsUnavailable={vm.agentTargetsUnavailable}
      approvalLabel={vm.approvalLabel}
      onApprove={vm.approve}
      onDeny={vm.deny}
    />
  )

  useEffect(() => {
    const phase = vm.decision.phase
    if (phase === 'idle' || phase === 'submitting') return
    const heading = document.getElementById('consent-outcome-heading')
    const recovery = document.getElementById('consent-outcome-recovery')
    ;(heading ?? recovery)?.focus()
  }, [vm.decision.phase])

  return (
    <AeOperatorPage operatorRole="owner" title="Review Agent access" description="Choose what this Agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        {vm.decision.phase === 'idle' || vm.decision.phase === 'submitting' ? (
          <div
            className="arc-market arc-consent-review"
            role="group"
            aria-label={`Access decision for ${vm.clientName}`}
          >
            <div className="arc-consent-review-head">
              <AeSection
                title={`Connect ${vm.clientName}`}
                description={vm.accessProfile === 'provider'
                  ? 'This separate credential can inspect and manage your provider Tools.'
                  : 'How much may this Agent do without asking you?'}
              >
                <ConsentRequestFacts
                  clientName={vm.clientName}
                  environment={vm.environment}
                  toolSelectionSummary={vm.toolSelectionSummary}
                  accessSummary={vm.accessSummary}
                  expiresInSeconds={vm.expiresInSeconds}
                  grantRevision={vm.grantRevision}
                  grantRef={vm.grantRef}
                  toolRefs={vm.toolRefs}
                  flow={details.flow}
                  {...(details.redirectDisposition === undefined ? {} : { redirectDisposition: details.redirectDisposition })}
                  {...(details.redirectOrigin === undefined ? {} : { redirectOrigin: details.redirectOrigin })}
                />
              </AeSection>
            </div>
            <div className="arc-consent-review-body">
              <div className="arc-consent-review-regions">
                <ConsentConnectionFieldset
                  pending={vm.pending}
                  connectionTarget={vm.connectionTarget}
                  replacementMode={vm.replacementMode}
                  {...(vm.replacementPrincipalRef === undefined ? {} : { replacementPrincipalRef: vm.replacementPrincipalRef })}
                  agentTargets={vm.agentTargets}
                  {...(vm.agentTargetsError === undefined ? {} : { agentTargetsError: vm.agentTargetsError })}
                  {...(vm.agentTargetsNextCursor === undefined ? {} : { agentTargetsNextCursor: vm.agentTargetsNextCursor })}
                  agentTargetsLoading={vm.agentTargetsLoading}
                  showConnectionFieldset={vm.showConnectionFieldset}
                  onSelectConnection={(value) => vm.dispatch({ kind: 'select_connection', value })}
                  onSelectReplacement={(value) => vm.dispatch({ kind: 'select_replacement', value })}
                  onSelectReplacementMode={(value) => vm.dispatch({ kind: 'select_replacement_mode', value })}
                  onLoadAgentTargets={vm.loadAgentTargets}
                />
                {vm.accessProfile === 'provider' ? (
                  <Alert>
                    <AlertTitle>Provider management</AlertTitle>
                    <AlertDescription>May inspect lifecycle and earnings, publish, recheck, withdraw, and republish your Tools. It cannot spend buyer credit or manage unrelated account settings.</AlertDescription>
                  </Alert>
                ) : (
                  <AuthorityModeRadioGroup
                    pending={vm.pending}
                    selectedMode={vm.selectedMode}
                    ceiling={vm.mode}
                    onSelectMode={(value) => vm.dispatch({ kind: 'select_mode', value })}
                  />
                )}
                {vm.accessProfile === 'market' ? (
                  <ConsentToolAccessFieldset
                    pending={vm.pending}
                    toolAccess={vm.toolAccess}
                    approvedToolAccess={vm.approvedToolAccess}
                    approvedToolRefs={vm.approvedToolRefs}
                    toolQuery={vm.toolQuery}
                    toolSearch={vm.toolSearch}
                    approvedToolRefSet={vm.approvedToolRefSet}
                    onApprovedToolAccessChange={vm.setApprovedToolAccess}
                    onToolQueryChange={vm.setToolQuery}
                    onFindTools={vm.findTools}
                    onContinueSearch={vm.continueSearch}
                    onAddApprovedTool={vm.addApprovedTool}
                    onRemoveApprovedTool={vm.removeApprovedTool}
                  />
                ) : null}
              </div>
            </div>
            {decisionBar}
          </div>
        ) : (
          <ConsentOutcomeView
            phase={vm.decision.phase}
            clientName={vm.clientName}
            grantRef={vm.grantRef}
            authorizeRecoverySearch={authorizeRecoverySearch}
            {...(vm.decision.phase === 'error'
              ? {
                  errorCode: vm.decision.errorCode,
                  ...(vm.decision.errorReference === undefined ? {} : { errorReference: vm.decision.errorReference }),
                }
              : {})}
          />
        )}
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
