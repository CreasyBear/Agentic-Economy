'use client'

import { SpendingLimitInputs } from '@/components/ae/shared/SpendingLimitInputs'
import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/arc/drawer/Drawer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { AgentAccessKeyIssueResult, IssuedAgentAccessReveal } from '@/modules/agent-access/issue-key.contracts'
import type { AgentKeyDraft } from './agent-key-draft'

import { AgentNameField } from './components/AgentNameField'
import { AuthorityModeRadioCards } from './components/AuthorityModeRadioCards'
import type { ConnectAgentEnvironment } from './connect-agent-wizard.contracts'
import {
  CONNECT_AGENT_WIZARD_LIMIT_IDS,
  CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS,
  CONNECT_AGENT_WIZARD_SANDBOX_DISPLAY,
  useConnectAgentWizard,
} from './useConnectAgentWizard'

import './ConnectAgentComposition.css'

export interface AeConnectAgentWizardDialogProps {
  deploymentEnvironment: ConnectAgentEnvironment
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssue: (args: { data: Record<string, unknown> }) => Promise<AgentAccessKeyIssueResult>
  onSuccess?: (reveal: IssuedAgentAccessReveal) => void
  initialDraft?: AgentKeyDraft
  onDraftChange?: (draft: AgentKeyDraft) => void
}

export function AeConnectAgentWizardDialog({
  deploymentEnvironment,
  open,
  onOpenChange,
  onIssue,
  onSuccess,
  initialDraft,
  onDraftChange,
}: Readonly<AeConnectAgentWizardDialogProps>) {
  const wizard = useConnectAgentWizard({
    deploymentEnvironment,
    open,
    onOpenChange,
    onIssue,
    ...(onSuccess !== undefined ? { onSuccess } : {}),
    ...(initialDraft === undefined ? {} : { initialDraft }),
    ...(onDraftChange === undefined ? {} : { onDraftChange }),
  })
  const { view } = wizard

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
        title="Connect an Agent"
        description="Step 1 of 2 · Set policy"
        className="arc-connect-agent-drawer"
        data-slot="dialog-content"
      >
        <form onSubmit={wizard.handleSubmit} className="arc-connect-agent-form">
          <div className="arc-connect-agent-fields">
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

            <AgentNameField
              value={view.name}
              disabled={view.isSubmitting}
              invalid={view.nameInvalid}
              inputRef={wizard.nameInputRef}
              onChange={wizard.handleNameChange}
            />

            <AuthorityModeRadioCards
              value={view.authorityMode}
              disabled={view.isSubmitting}
              onChange={wizard.setAuthorityMode}
            />

            <div className="arc-connect-agent-limits">
              <SpendingLimitInputs
                presentation={view.spendingPresentation}
                ids={CONNECT_AGENT_WIZARD_LIMIT_IDS}
                values={{
                  perCall: view.perCallAmount,
                  daily: view.dailyAmount,
                  monthly: view.monthlyAmount,
                }}
                disabled={view.isSubmitting}
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
            </div>
          </div>

          <footer className="arc-connect-agent-footer">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={view.isSubmitting}
              onClick={() => wizard.handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={view.isSubmitting}
              aria-busy={view.isSubmitting || undefined}
            >
              {view.isSubmitting ? 'Connecting…' : 'Connect an Agent'}
            </Button>
          </footer>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
