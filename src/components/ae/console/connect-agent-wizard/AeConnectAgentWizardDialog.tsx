'use client'

import { useEffect, useRef, useState } from 'react'

import { SpendingLimitInputs } from '@/components/ae/shared/SpendingLimitInputs'
import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import { MultiStepForm } from '@/components/arc/blocks/multi-step-form/multi-step-form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { AgentAccessKeyIssueResult, IssuedAgentAccessReveal } from '@/modules/agent-access/issue-key.contracts'
import type { AgentKeyDraft } from './agent-key-draft'

import { AgentNameField } from './components/AgentNameField'
import { AuthorityModeRadioCards } from './components/AuthorityModeRadioCards'
import type { ConnectAgentEnvironment, ConnectAgentIssuePhase, ConnectAgentWizardViewState } from './connect-agent-wizard.contracts'
import {
  CONNECT_AGENT_WIZARD_LIMIT_IDS,
  CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS,
  CONNECT_AGENT_WIZARD_SANDBOX_DISPLAY,
  useConnectAgentWizard,
} from './useConnectAgentWizard'

import './ConnectAgentComposition.css'

type ConnectAgentWizardStep = 'identity' | 'limits' | 'review'

export interface AeConnectAgentWizardDialogProps {
  deploymentEnvironment: ConnectAgentEnvironment
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssuePhaseChange?: (phase: ConnectAgentIssuePhase) => void
  onIssue: (args: { data: Record<string, unknown> }) => Promise<AgentAccessKeyIssueResult>
  onSuccess?: (reveal: IssuedAgentAccessReveal) => void
  initialDraft?: AgentKeyDraft
  onDraftChange?: (draft: AgentKeyDraft) => void
}

/** Draft presentation only. Exact draft strings, validation, issuance and
 * confirmation remain in the existing wizard; this mapper creates no access. */
function wizardPresentation(view: ConnectAgentWizardViewState, step: ConnectAgentWizardStep) {
  return {
    pending: view.isSubmitting || view.awaitingConfirmation,
    authorityLabel: view.authorityMode === 'read_only' ? 'Browse only' : view.authorityMode === 'approval_required' ? 'Ask each time' : 'Work within limits',
    environmentLabel: view.environment === 'sandbox' ? 'Sandbox' : 'Production',
    spendingLabel: view.environment === 'sandbox' ? 'A$1.00 per Call · A$5.00 daily · A$20.00 monthly' : `A$${view.perCallAmount.trim()} per Call · A$${view.dailyAmount.trim()} daily · A$${view.monthlyAmount.trim()} monthly`,
    submitLabel: view.isSubmitting ? 'Issuing key…' : view.awaitingConfirmation ? 'Confirm this issuance' : step === 'identity' ? 'Set spending limits' : step === 'limits' ? 'Review access' : 'Issue key',
  }
}

export function AeConnectAgentWizardDialog({
  deploymentEnvironment,
  open,
  onOpenChange,
  onIssue,
  onIssuePhaseChange,
  onSuccess,
  initialDraft,
  onDraftChange,
}: Readonly<AeConnectAgentWizardDialogProps>) {
  const wizard = useConnectAgentWizard({
    deploymentEnvironment,
    open,
    onOpenChange,
    onIssue,
    ...(onIssuePhaseChange === undefined ? {} : { onIssuePhaseChange }),
    ...(onSuccess !== undefined ? { onSuccess } : {}),
    ...(initialDraft === undefined ? {} : { initialDraft }),
    ...(onDraftChange === undefined ? {} : { onDraftChange }),
  })
  const { view } = wizard
  const [step, setStep] = useState<ConnectAgentWizardStep>('identity')
  const limitsHeading = useRef<HTMLHeadingElement>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (!open) setStep('identity') }, [open])
  useEffect(() => {
    if (step === 'limits') limitsHeading.current?.focus()
    if (step === 'review') reviewHeading.current?.focus()
  }, [step])
  const presentation = wizardPresentation(view, step)

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && eventDetails.reason === 'outside-press') {
          const target = eventDetails.event.target
          if (target instanceof Element && target.closest('[role="alertdialog"]') !== null) {
            eventDetails.cancel()
            return
          }
        }
        wizard.handleOpenChange(nextOpen)
      }}
    >
      <DrawerContent
        side="right"
        title="Issue a manual Agent key"
        description="Choose access, review it, then save the one-time secret in your client."
        className="arc-connect-agent-drawer"
        data-slot="dialog-content"
      >
        <form onSubmit={(event) => {
          event.preventDefault()
          if (step === 'identity') {
            if (view.isNameValid) setStep('limits')
            else void wizard.canReviewDraft()
            return
          }
          if (step === 'limits') {
            if (wizard.canReviewDraft()) setStep('review')
            return
          }
          void wizard.handleSubmit(event)
        }} className="arc-connect-agent-form">
          <div className="arc-connect-agent-fields">
            <MultiStepForm activeStep={step} steps={[
              { id: 'identity', title: 'Name and authority' },
              { id: 'limits', title: 'Spending limits' },
              { id: 'review', title: 'Review and issue' },
            ]}>
            {view.diagnostic !== null ? (
              <div aria-live="polite">
                <Alert variant="destructive">
                  <AlertTitle>{view.diagnostic.whatHappened}</AlertTitle>
                  <AlertDescription className="grid gap-1">
                    <span>{view.diagnostic.financialImpact}</span>
                    <span>{view.diagnostic.nextStep}</span>
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}

            {step === 'identity' ? <>
              <AgentNameField
                value={view.name}
                disabled={presentation.pending}
                invalid={view.nameInvalid}
                inputRef={wizard.nameInputRef}
                onChange={wizard.handleNameChange}
              />

              <AuthorityModeRadioCards
                value={view.authorityMode}
                disabled={presentation.pending}
                onChange={wizard.setAuthorityMode}
              />
            </> : step === 'limits' ? <div className="arc-connect-agent-limits">
              <h3 ref={limitsHeading} tabIndex={-1}>Set spending limits for {view.name.trim()}</h3>
              <SpendingLimitInputs
                presentation={view.spendingPresentation}
                ids={CONNECT_AGENT_WIZARD_LIMIT_IDS}
                values={{
                  perCall: view.perCallAmount,
                  daily: view.dailyAmount,
                  monthly: view.monthlyAmount,
                }}
                disabled={presentation.pending}
                className="arc-connect-agent-limit-grid"
                placeholders={CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS}
                sandboxDisplay={CONNECT_AGENT_WIZARD_SANDBOX_DISPLAY}
                onPerCallChange={wizard.setPerCallAmount}
                onDailyChange={wizard.setDailyAmount}
                onMonthlyChange={wizard.setMonthlyAmount}
              />
              <p className="arc-connect-agent-hint">
                Per-call ≤ daily ≤ monthly. AUD, GST-inclusive prepaid credit.
              </p>
            </div> : <div className="arc-connect-agent-review">
              <h3 ref={reviewHeading} tabIndex={-1}>Review access for {view.name.trim()}</h3>
              <dl>
                <div><dt>Environment</dt><dd>{presentation.environmentLabel}</dd></div>
                <div><dt>Authority</dt><dd>{presentation.authorityLabel}</dd></div>
                <div><dt>Spending ceiling</dt><dd>{presentation.spendingLabel}</dd></div>
              </dl>
              <p>Issuing a key creates access. It makes no purchase and does not confirm that your Agent has authenticated. Save the secret next, then return to your task.</p>
            </div>}
            </MultiStepForm>
          </div>

          <footer className="arc-connect-agent-footer">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={presentation.pending}
              onClick={() => wizard.handleOpenChange(false)}
            >
              Cancel
            </Button>
            {step === 'limits' ? <Button type="button" variant="secondary" disabled={presentation.pending} onClick={() => {
              setStep('identity')
              requestAnimationFrame(() => wizard.nameInputRef.current?.focus())
            }}>Back to name and authority</Button> : null}
            {step === 'review' ? <Button type="button" variant="secondary" disabled={presentation.pending} onClick={() => setStep('limits')}>Edit spending limits</Button> : null}
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={view.isSubmitting}
              aria-busy={view.isSubmitting || undefined}
            >
              {presentation.submitLabel}
            </Button>
          </footer>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
