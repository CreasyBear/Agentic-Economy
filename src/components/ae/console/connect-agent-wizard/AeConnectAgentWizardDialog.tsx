'use client'

import { SpendingLimitInputs } from '@/components/ae/shared/SpendingLimitInputs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AgentAccessKeyIssueResult, IssuedAgentAccessReveal } from '@/modules/agent-access/issue-key.contracts'

import { AgentNameField } from './components/AgentNameField'
import { AuthorityModeRadioCards } from './components/AuthorityModeRadioCards'
import { EnvironmentRadioCards } from './components/EnvironmentRadioCards'
import {
  CONNECT_AGENT_WIZARD_LIMIT_IDS,
  CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS,
  CONNECT_AGENT_WIZARD_SANDBOX_DISPLAY,
  useConnectAgentWizard,
} from './useConnectAgentWizard'

export interface AeConnectAgentWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssue: (args: { data: Record<string, unknown> }) => Promise<AgentAccessKeyIssueResult>
  onSuccess?: (reveal: IssuedAgentAccessReveal) => void
}

export function AeConnectAgentWizardDialog({
  open,
  onOpenChange,
  onIssue,
  onSuccess,
}: Readonly<AeConnectAgentWizardDialogProps>) {
  const wizard = useConnectAgentWizard({
    onOpenChange,
    onIssue,
    ...(onSuccess !== undefined ? { onSuccess } : {}),
  })
  const { view } = wizard

  return (
    <Dialog open={open} onOpenChange={wizard.handleOpenChange}>
      <DialogContent className="sm:max-w-[620px]" data-slot="dialog-content">
        <form onSubmit={wizard.handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect an Agent</DialogTitle>
            <DialogDescription>Step 1 of 2 · Set policy</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
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
              onChange={wizard.handleNameChange}
            />

            <EnvironmentRadioCards
              value={view.environment}
              disabled={view.isSubmitting}
              onChange={wizard.handleEnvironmentChange}
            />

            <AuthorityModeRadioCards
              value={view.authorityMode}
              disabled={view.isSubmitting}
              onChange={wizard.setAuthorityMode}
            />

            <div className="rounded-md border p-3">
              <SpendingLimitInputs
                presentation={view.spendingPresentation}
                ids={CONNECT_AGENT_WIZARD_LIMIT_IDS}
                values={{
                  perCall: view.perCallAmount,
                  daily: view.dailyAmount,
                  monthly: view.monthlyAmount,
                }}
                disabled={view.isSubmitting}
                className="grid grid-cols-3 gap-2"
                placeholders={CONNECT_AGENT_WIZARD_LIMIT_PLACEHOLDERS}
                sandboxDisplay={CONNECT_AGENT_WIZARD_SANDBOX_DISPLAY}
                onPerCallChange={wizard.setPerCallAmount}
                onDailyChange={wizard.setDailyAmount}
                onMonthlyChange={wizard.setMonthlyAmount}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Per-call ≤ daily ≤ monthly. AUD, GST-inclusive prepaid credit.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={view.isSubmitting}
              onClick={() => wizard.handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!view.isNameValid || view.isSubmitting}>
              {view.isSubmitting ? 'Connecting…' : 'Connect an Agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
