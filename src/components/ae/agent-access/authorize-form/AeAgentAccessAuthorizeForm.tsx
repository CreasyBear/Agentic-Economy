import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Link } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AlphaLearningNotice } from '@/components/ae/shared/AlphaLearningNotice'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { MultiStepForm } from '@/components/ae/shared/arc-pro/multi-step-form/multi-step-form'
import type { CompletedFormStep, FormStep } from '@/components/ae/shared/arc-pro/multi-step-form/multi-step-form'
import { SettingsPageGroup, SettingsPageRow } from '@/components/ae/shared/arc-pro/settings-page/settings-page'
import { Button } from '@/components/arc/button/button'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import type { AgentAccessAuthorizeFormDetails, ConsentLocator } from '@/modules/agent-access/consent.contracts'

import { AuthorityModeRadioGroup } from './components/AuthorityModeRadioGroup'
import { authorityOptions } from './authorize-form.contracts'
import { ConsentConnectionFieldset } from './components/ConsentConnectionFieldset'
import { ConsentDecisionBar } from './components/ConsentDecisionBar'
import { ConsentOutcomeView } from './components/ConsentOutcomeView'
import { ConsentRequestFacts } from './components/ConsentRequestFacts'
import { ConsentToolAccessFieldset } from './components/ConsentToolAccessFieldset'
import { useAgentConsentDecision } from './useAgentConsentDecision'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './ConsentComposition.css'

export type AeAgentAccessAuthorizeFormProps = Readonly<{
  locator: ConsentLocator
  oauthState?: string
  details: AgentAccessAuthorizeFormDetails
}>

type ConsentFormStage = 'connection' | 'authority' | 'tools' | 'review'

type ConsentFormModel = ReturnType<typeof useAgentConsentDecision>

function consentChoiceSummaries(vm: ConsentFormModel) {
  const replacementTarget = vm.connectionTarget === 'replace_credential'
    ? vm.agentTargets.find((target) => target.principalRef === vm.replacementPrincipalRef)
    : undefined
  const connectionSummary = vm.connectionTarget === 'new_agent'
    ? 'New agent'
    : replacementTarget === undefined
      ? vm.replacementPrincipalRef ?? ''
      : `${replacementTarget.displayName} · ${replacementTarget.principalRef}`
  const replacementReasonSummary = vm.replacementMode === 'planned'
    ? 'Planned rotation. The current credential remains usable until the new one is delivered.'
    : 'Suspected compromise. The current authority is revoked first and is never reactivated.'
  const authoritySummary = authorityOptions.find((option) => option.value === vm.selectedMode)?.label ?? vm.selectedMode
  const connectionDetail = vm.connectionTarget === 'replace_credential' ? `${connectionSummary} · ${replacementReasonSummary}` : connectionSummary
  return { replacementTarget, connectionSummary, connectionDetail, replacementReasonSummary, authoritySummary }
}

function ConsentReviewChoices({ vm, connectionSummary, replacementReasonSummary, authoritySummary, onEdit }: Readonly<{
  vm: ConsentFormModel
  connectionSummary: string
  replacementReasonSummary: string
  authoritySummary: string
  onEdit: (stage: ConsentFormStage) => void
}>) {
  return (
    <>
      <SettingsPageGroup title="Your choices">
        <SettingsPageRow label="Connection">
          <div className="arc-consent-summary-value">
            <p>{connectionSummary}</p>
            {vm.connectionTarget === 'replace_credential' ? <p>{replacementReasonSummary}</p> : null}
          </div>
          {vm.showConnectionFieldset ? (
            <Button type="button" variant="secondary" className="arc-consent-step-edit" disabled={vm.pending} onClick={() => onEdit('connection')}>
              Edit Connection
            </Button>
          ) : null}
        </SettingsPageRow>
        {vm.accessProfile === 'market' ? (
          <>
            <SettingsPageRow label="Authority">
              <p className="arc-consent-summary-value">{authoritySummary}</p>
              <Button type="button" variant="secondary" className="arc-consent-step-edit" disabled={vm.pending} onClick={() => onEdit('authority')}>
                Edit Authority
              </Button>
            </SettingsPageRow>
            <SettingsPageRow label="Tools">
              <div>
                <p className="arc-consent-summary-value">{vm.toolSelectionSummary}</p>
                {vm.approvedToolAccess === 'selected_tools' ? (
                  <ul className="arc-consent-summary-tools">
                    {vm.approvedToolRefs.map((toolRef) => <li key={toolRef}><code>{toolRef}</code></li>)}
                  </ul>
                ) : null}
              </div>
              <Button type="button" variant="secondary" className="arc-consent-step-edit" disabled={vm.pending} onClick={() => onEdit('tools')}>
                Edit Tools
              </Button>
            </SettingsPageRow>
          </>
        ) : null}
      </SettingsPageGroup>
      {vm.accessProfile === 'market' ? <AlphaLearningNotice /> : null}
      {vm.accessProfile === 'provider' ? (
        <AeAlert role="alert" tone="info" title="Provider management">May inspect lifecycle and earnings, publish, recheck, withdraw, and republish your Tools. It cannot spend buyer credit or manage unrelated account settings.</AeAlert>
      ) : null}
    </>
  )
}

function ConsentStepContent({ stage, vm, connectionSummary, replacementReasonSummary, authoritySummary, onEdit }: Readonly<{
  stage: ConsentFormStage
  vm: ConsentFormModel
  connectionSummary: string
  replacementReasonSummary: string
  authoritySummary: string
  onEdit: (stage: ConsentFormStage) => void
}>) {
  return (
    <>
      {stage === 'connection' ? (
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
      ) : stage === 'authority' ? (
        <AuthorityModeRadioGroup
          pending={vm.pending}
          selectedMode={vm.selectedMode}
          ceiling={vm.mode}
          onSelectMode={(value) => vm.dispatch({ kind: 'select_mode', value })}
        />
      ) : stage === 'tools' ? (
        <>
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
          <AlphaLearningNotice />
        </>
      ) : (
        <>
          <ConsentReviewChoices
            vm={vm}
            connectionSummary={connectionSummary}
            replacementReasonSummary={replacementReasonSummary}
            authoritySummary={authoritySummary}
            onEdit={onEdit}
          />
        </>
      )}
    </>
  )
}

function ConsentStepActions({ stage, vm, previousStep, onEdit, onContinue }: Readonly<{
  stage: ConsentFormStage
  vm: ConsentFormModel
  previousStep: FormStep | undefined
  onEdit: (stage: ConsentFormStage) => void
  onContinue: () => void
}>) {
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
  return (
    <div className="arc-consent-step-actions">
      {previousStep === undefined ? null : (
        <Button type="button" variant="secondary" className="arc-consent-step-edit" disabled={vm.pending} onClick={() => onEdit(previousStep.id as ConsentFormStage)}>
          Back
        </Button>
      )}
      {stage === 'review' ? decisionBar : (
        <>
          <Button
            type="button"
            variant="primary"
            disabled={vm.pending || (stage === 'connection' && vm.agentTargetsUnavailable)}
            onClick={onContinue}
          >
            {stage === 'connection'
              ? vm.accessProfile === 'provider' ? 'Review access' : 'Continue to authority'
              : stage === 'authority' ? 'Continue to Tools' : 'Review access'}
          </Button>
          <Button type="button" aria-describedby="consent-expiry" variant="secondary" disabled={vm.pending} onClick={() => void vm.deny()}>
            Decline
          </Button>
        </>
      )}
    </div>
  )
}

function ConsentFlowView({ vm, details, stage, steps, completedSteps, previousStep, flowRef, connectionSummary, replacementReasonSummary, authoritySummary, onEdit, onContinue }: Readonly<{
  vm: ConsentFormModel
  details: AgentAccessAuthorizeFormDetails
  stage: ConsentFormStage
  steps: readonly FormStep[]
  completedSteps: readonly CompletedFormStep[]
  previousStep: FormStep | undefined
  flowRef: RefObject<HTMLDivElement | null>
  connectionSummary: string
  replacementReasonSummary: string
  authoritySummary: string
  onEdit: (stage: ConsentFormStage) => void
  onContinue: () => void
}>) {
  return (
    <div className="arc-market arc-consent-flow" role="group" aria-label={`Access decision for ${vm.clientName}`}>
      <div className="arc-consent-flow-regions" ref={flowRef}>
        <ConsentRequestFacts
          presentation={stage === 'review' ? 'review' : stage === 'authority' ? 'authority' : 'context'}
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
        <MultiStepForm
          progressLabel="Access decision steps"
          activeStep={stage}
          steps={steps}
          {...(stage === 'review' ? {} : { completedSteps })}
          {...(vm.pending ? { feedback: <p role="status" aria-live="polite">Submitting your access decision…</p> } : {})}
        >
          <ConsentStepContent
            stage={stage}
            vm={vm}
            connectionSummary={connectionSummary}
            replacementReasonSummary={replacementReasonSummary}
            authoritySummary={authoritySummary}
            onEdit={onEdit}
          />
          <ConsentStepActions
            stage={stage}
            vm={vm}
            previousStep={previousStep}
            onEdit={onEdit}
            onContinue={onContinue}
          />
        </MultiStepForm>
      </div>
    </div>
  )
}

export function AeAgentAccessAuthorizeForm(props: AeAgentAccessAuthorizeFormProps) {
  return (
    <AeAgentAccessAuthorizeFormLifetime
      key={JSON.stringify([props.details.grantRef, props.details.grantRevision])}
      {...props}
    />
  )
}

function AeAgentAccessAuthorizeFormLifetime({ locator, oauthState, details }: AeAgentAccessAuthorizeFormProps) {
  const vm = useAgentConsentDecision({ locator, details, ...(oauthState === undefined ? {} : { oauthState }) })
  const steps: readonly FormStep[] = [
    ...(vm.showConnectionFieldset ? [{ id: 'connection', title: 'Choose a connection' }] : []),
    ...(vm.accessProfile === 'market'
      ? [
          { id: 'authority', title: 'Choose authority' },
          { id: 'tools', title: 'Choose Tools' },
        ]
      : []),
    { id: 'review', title: 'Review access' },
  ]
  const [stage, setStage] = useState<ConsentFormStage>(() => steps[0]!.id as ConsentFormStage)
  const flowRef = useRef<HTMLDivElement>(null)
  const authorizeRecoverySearch = {
    grant_ref: vm.grantRef,
    ...(oauthState === undefined ? {} : { state: oauthState }),
  }

  const activeStage = steps.some((step) => step.id === stage) ? stage : steps[0]!.id as ConsentFormStage
  const previousStageRef = useRef<ConsentFormStage>(activeStage)
  const activeStepIndex = steps.findIndex((step) => step.id === activeStage)
  const activeStepTitle = steps[activeStepIndex]?.title
  const { replacementTarget, connectionSummary, connectionDetail, replacementReasonSummary, authoritySummary } = consentChoiceSummaries(vm)
  const previousStep = steps[activeStepIndex - 1]
  const completedSteps = steps.slice(0, activeStepIndex).map((step) => {
    const detail = step.id === 'connection'
      ? connectionDetail
      : step.id === 'authority'
        ? authoritySummary
        : vm.toolSelectionSummary
    return {
      id: step.id,
      title: step.title,
      detail,
      disabled: vm.pending,
      onEdit: () => setStage(step.id as ConsentFormStage),
    }
  })

  useEffect(() => {
    const phase = vm.decision.phase
    if (phase === 'idle' || phase === 'submitting') return
    const heading = document.getElementById('consent-outcome-heading')
    const recovery = document.getElementById('consent-outcome-recovery')
    ;(heading ?? recovery)?.focus()
  }, [vm.decision.phase])

  useEffect(() => {
    if (previousStageRef.current === activeStage) return
    previousStageRef.current = activeStage
    if (activeStepTitle === undefined) return
    const legend = Array.from(flowRef.current?.querySelectorAll<HTMLLegendElement>('fieldset > legend') ?? [])
      .find((item) => item.textContent?.trim() === activeStepTitle)
    if (!legend) return
    legend.tabIndex = -1
    legend.focus()
  }, [activeStepTitle, activeStage])

  function continueToNextStage() {
    if (vm.pending) return
    if (activeStage === 'connection') {
      if (vm.agentTargetsUnavailable) return
      if (vm.connectionTarget === 'replace_credential' && replacementTarget === undefined) {
        document.getElementById('replacement-agent')?.focus()
        return
      }
    }
    if (activeStage === 'tools' && vm.approvedToolAccess === 'selected_tools' && vm.approvedToolRefs.length === 0) {
      const emptyField = document.getElementById('tool-search') ?? document.getElementById('tool-selection-empty')
      emptyField?.focus()
      return
    }
    const nextStep = steps[activeStepIndex + 1]
    if (nextStep !== undefined) setStage(nextStep.id as ConsentFormStage)
  }

  return (
    <AeOperatorPage operatorRole="owner" title="Review Agent access" description="Choose what this Agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        {vm.decision.phase === 'idle' || vm.decision.phase === 'submitting' ? (
          <ConsentFlowView
            vm={vm}
            details={details}
            stage={activeStage}
            steps={steps}
            completedSteps={completedSteps}
            previousStep={previousStep}
            flowRef={flowRef}
            connectionSummary={connectionSummary}
            replacementReasonSummary={replacementReasonSummary}
            authoritySummary={authoritySummary}
            onEdit={setStage}
            onContinue={continueToNextStage}
          />
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
        <Link to="/agent-access" search={{ grantRef: vm.grantRef, ...(oauthState === undefined ? {} : { state: oauthState }) }}
          target="_blank" rel="noopener" className={actionLinkClassName('secondary', 'md')}>
          Follow live onboarding
        </Link>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
