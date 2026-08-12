import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import { accountRefForOperator, addExactAmounts, type ExactAmount } from '@/modules/money/public'
import type { CreditAccountView, CreditActivityView, KeyUsageView } from '@/modules/money/public'

import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'
import { AeCreditTopUpPanel, type CreditTopupPort, type CreditTopupTarget } from './AeCreditTopUpPanel'
import type { PendingOperationApproval } from '@/modules/capability-execution/operation-approval.functions'

export type AgentOperatorKeyReadback = Readonly<{
  key: AgentAccessKeyInventoryItem
  grant?: AgentAccessOwnerGrantReadback
  principalId: string
  account?: CreditAccountView
  activity: readonly CreditActivityView[]
  usage?: KeyUsageView
  dataState: 'source' | 'empty' | 'unavailable'
}>

export type AeAgentOperatorConsoleProps = Readonly<{
  items: readonly AgentOperatorKeyReadback[]
  loading: boolean
  onRevoke: (keyId: string) => void
  revokingKeyId?: string
  approvals: readonly PendingOperationApproval[]
  approvalsLoading: boolean
  approvalsError?: string
  approvalDecision?: Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>
  approvalStatus?: string
  onRetryApprovals: () => void
  onDecideApproval: (invocationRef: string, operationRef: string, decision: 'approve' | 'deny') => void
  accessUnavailable?: boolean
  creditTopupPort?: CreditTopupPort
  onCreditRefresh?: () => void | Promise<void>
}>

export function AeAgentOperatorConsole({
  items,
  loading,
  onRevoke,
  revokingKeyId,
  approvals,
  approvalsLoading,
  approvalsError,
  approvalDecision,
  approvalStatus,
  onRetryApprovals,
  onDecideApproval,
  accessUnavailable = false,
  creditTopupPort,
  onCreditRefresh,
}: AeAgentOperatorConsoleProps) {
  const balanceAmounts = items.flatMap(({ account }) => account === undefined ? [] : [account.balance])
  const balance = balanceAmounts.reduce<ExactAmount | undefined>((total, amount, index) => (
    index === 0 ? amount : total === undefined ? undefined : addExactAmounts(total, amount)
  ), undefined)
  const activity = items.flatMap((item) => item.activity.map((entry) => ({ item, entry }))).sort((left, right) => right.entry.observedAt - left.entry.observedAt)
  const hasUnavailableData = items.some((item) => item.dataState === 'unavailable')
  const creditTopupTarget: CreditTopupTarget | undefined = (() => {
    const item = items.find(({ account }) => account?.evidence === 'source')
    if (item?.account === undefined) return undefined
    return {
      principalId: item.principalId,
      accountRef: accountRefForOperator(item.principalId, item.account.balance.currency),
      currency: item.account.balance.currency,
      exponent: item.account.balance.exponent,
    }
  })()

  const approvalsSection = (
    <WaitingApprovalsSection
      approvals={approvals}
      loading={approvalsLoading}
      {...(approvalsError === undefined ? {} : { error: approvalsError })}
      {...(approvalDecision === undefined ? {} : { decision: approvalDecision })}
      onRetry={onRetryApprovals}
      onDecide={onDecideApproval}
    />
  )

  return (
    <div className="grid gap-6">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{approvalStatus ?? ''}</p>
      {accessUnavailable ? approvalsSection : (
        <>
      <section aria-labelledby="credit-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="credit-title" className="text-2xl font-semibold tracking-tight text-foreground">Check your balance</h2>
          <p className="block text-muted-foreground">Browsing is free. Paid calls use the credit assigned to each assistant.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="border border-border bg-card">
            <CardContent className="grid gap-2">
              <p className="text-sm font-semibold text-muted-foreground">AVAILABLE CREDIT</p>
              <p className="text-lg font-semibold text-foreground">{hasUnavailableData ? 'Balance unavailable' : formatAmount(balance)}</p>
              <p className="text-sm text-muted-foreground">{hasUnavailableData ? 'Some balance details are temporarily unavailable.' : 'Keep credit separate for each assistant.'}</p>
            </CardContent>
          </Card>
          <AeCreditTopUpPanel
            {...(creditTopupTarget === undefined ? {} : { target: creditTopupTarget })}
            {...(creditTopupPort === undefined ? {} : { port: creditTopupPort })}
            {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
          />
        </div>
      </section>

      <section aria-labelledby="ledger-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="ledger-title" className="text-2xl font-semibold tracking-tight text-foreground">Review recent activity</h2>
          <p className="block text-muted-foreground">See calls and credit changes for each assistant.</p>
        </div>
        {loading ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground">Loading recent activity…</p>
            </CardContent>
          </Card>
        ) : hasUnavailableData ? (
          <Card className="border border-border bg-card">
            <CardContent className="grid gap-2">
              <p className="font-semibold text-foreground">Activity unavailable</p>
              <p className="text-muted-foreground">Some call details are temporarily unavailable.</p>
            </CardContent>
          </Card>
        ) : activity.length === 0 ? (
          <Card className="border border-border bg-card">
            <CardContent className="grid gap-2">
              <p className="font-semibold text-foreground">No calls yet</p>
              <p className="text-muted-foreground">Browsing does not create paid-call charges.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border border-border bg-card">
            <CardContent className="p-0">
              <ol className="m-0 list-none divide-y divide-border p-0">
                {activity.map(({ item, entry }) => <ActivityRow key={entry.activityRef} item={item} entry={entry} />)}
              </ol>
            </CardContent>
          </Card>
        )}
      </section>

      {approvalsSection}

      <section aria-labelledby="keys-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="keys-title" className="text-2xl font-semibold tracking-tight text-foreground">Manage assistant access</h2>
          <p className="block text-muted-foreground">Review what each assistant can do, its usage, and spend. Revoked or expired access stays visible.</p>
          <p className="block text-sm text-muted-foreground">Consumer keys identify assistants. Supplier connections and credentials are managed separately and never appear here.</p>
        </div>
        {loading ? <p className="text-muted-foreground">Loading assistant access…</p> : items.length === 0 ? (
          <Card className="border border-border bg-card">
            <CardContent>
              <p className="text-muted-foreground">No assistant is connected yet. Start setup from your assistant and approve the request to create access you can revoke.</p>
            </CardContent>
          </Card>
        ) : items.map((item) => <KeyCard key={item.key.keyId} item={item} revoking={revokingKeyId === item.key.keyId} disabled={revokingKeyId !== undefined} onRevoke={onRevoke} />)}
      </section>

      <section aria-labelledby="recovery-title" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="recovery-title" className="text-2xl font-semibold tracking-tight text-foreground">Recover access safely</h2>
          <p className="block text-muted-foreground">The next step depends on what stopped the call.</p>
        </div>
        <ul className="m-0 grid list-none divide-y divide-border p-0">
          <RecoveryItem title="Lost, expired, or revoked agent key">
            Start a new access request from the assistant. AE delivers the replacement consumer key to that assistant once; supplier credentials stay server-side.
          </RecoveryItem>
          <RecoveryItem title="Stale access grant">
            Revoke the affected access, then approve a new request so the key and current grant are issued together.
          </RecoveryItem>
          <RecoveryItem title="Provider reauthorization required">
            The supplier connection owner must reauthorize that connection. Do not put a supplier credential into the agent key or request payload.
          </RecoveryItem>
          <RecoveryItem title="Outcome uncertain">
            Reconcile the recorded invocation before retrying. A retry could repeat work that the supplier already received.
          </RecoveryItem>
        </ul>
      </section>
        </>
      )}
    </div>
  )
}

function WaitingApprovalsSection({
  approvals,
  loading,
  error,
  decision,
  onRetry,
  onDecide,
}: Readonly<{
  approvals: readonly PendingOperationApproval[]
  loading: boolean
  error?: string
  decision?: Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>
  onRetry: () => void
  onDecide: (invocationRef: string, operationRef: string, decision: 'approve' | 'deny') => void
}>) {
  if (!loading && error === undefined && approvals.length === 0) return null

  return (
    <section aria-labelledby="operation-approvals-title" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="operation-approvals-title" className="text-2xl font-semibold tracking-tight text-foreground">Waiting for your approval</h2>
        <p className="text-muted-foreground">Review the exact operation before allowing it to run once.</p>
      </div>
      {loading && approvals.length === 0 ? <p className="text-muted-foreground">Loading waiting approvals…</p> : null}
      {error === undefined ? null : (
        <Alert variant="destructive">
          <AlertTitle>Waiting approvals unavailable</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button type="button" variant="secondary" disabled={loading} onClick={onRetry}>
              {loading ? 'Refreshing approvals…' : 'Refresh approvals'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {approvals.length === 0 ? null : (
        <Card className="overflow-hidden border border-border bg-card">
          <CardContent className="p-0">
            <ol className="m-0 list-none divide-y divide-border p-0">
              {approvals.map((approval) => {
                const deciding = decision?.invocationRef === approval.invocationRef
                const controlsDisabled = decision !== undefined
                return (
                  <li key={approval.invocationRef} className="grid min-w-0 gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="grid min-w-0 gap-3">
                      <div className="grid gap-1">
                        <p className="text-sm font-medium text-muted-foreground">Operation</p>
                        <p className="break-all font-semibold text-foreground">{approval.operationRef}</p>
                      </div>
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <Metric label="Consequence" value={consequenceLabel(approval.authorityRequest.consequence)} />
                        {approval.authorityRequest.maximumSpend === undefined ? null : (
                          <Metric label="Maximum spend" value={formatCurrencyAmount(approval.authorityRequest.maximumSpend)} />
                        )}
                        <Metric
                          label="Data fields"
                          value={approval.authorityRequest.dataFields.length === 0
                            ? 'None'
                            : approval.authorityRequest.dataFields.join(', ')}
                        />
                      </dl>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                      <Button
                        type="button"
                        className="min-h-11 w-full sm:w-auto"
                        disabled={controlsDisabled}
                        onClick={() => onDecide(approval.invocationRef, approval.operationRef, 'approve')}
                      >
                        {deciding && decision?.decision === 'approve' ? 'Approving once…' : 'Approve once'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11 w-full sm:w-auto"
                        disabled={controlsDisabled}
                        onClick={() => onDecide(approval.invocationRef, approval.operationRef, 'deny')}
                      >
                        {deciding && decision?.decision === 'deny' ? 'Declining…' : 'Decline'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function consequenceLabel(consequence: PendingOperationApproval['authorityRequest']['consequence']): string {
  if (consequence === 'read_only') return 'Read only'
  if (consequence === 'communication') return 'Sends a communication'
  return 'Creates an external effect'
}

function ActivityRow({ item, entry }: Readonly<{ item: AgentOperatorKeyReadback; entry: CreditActivityView }>) {
  return (
    <li className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid gap-1">
        <p className="font-semibold text-foreground">{activityLabel(entry)}</p>
        <p className="text-sm text-muted-foreground">{item.key.name} · {formatTimestamp(entry.observedAt)}</p>
        <Link
          to="/operations/invocations/$invocationRef"
          params={{ invocationRef: entry.invocationRef }}
          className="w-fit text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View invocation status
        </Link>
      </div>
      <p className="font-semibold text-foreground">{formatAmount(entry.grossAmount)}</p>
    </li>
  )
}

function KeyCard({ item, revoking, disabled, onRevoke }: Readonly<{ item: AgentOperatorKeyReadback; revoking: boolean; disabled: boolean; onRevoke: (keyId: string) => void }>) {
  const usage = item.usage
  const accountBalance = item.account?.balance
  const zeroBalance = accountBalance === undefined ? undefined : { ...accountBalance, units: '0' }
  const missingGrant = item.grant === undefined
  const status = item.key.revoked ? 'Revoked' : item.key.expired ? 'Expired' : missingGrant ? 'Needs attention' : 'Connected'
  const recovery = item.key.revoked || item.key.expired
    ? 'To reconnect, start a new access request from the assistant.'
    : missingGrant
      ? 'This key does not have a current grant. Revoke it, then approve a new access request.'
      : usage?.states.includes('outcome_unknown')
        ? 'One or more calls needs checking. Reconcile the recorded outcome before retrying.'
        : 'Revoking blocks new calls immediately; prior usage and evidence remain visible.'
  return (
    <Card className="border border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>{item.key.name}</CardTitle>
        <Badge variant={status === 'Connected' ? 'default' : 'outline'}>{status}</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Agent key" value={redactedKeyId(item.key.keyId)} />
          <Metric label="Application" value={item.key.applicationRef} />
          <Metric label="Environment" value={item.key.environment === 'sandbox' ? 'Development' : 'Production'} />
          <Metric label="Per call" value={formatAmount(item.grant?.budget.maximumSpendPerInvocation)} />
          <Metric label="Daily budget" value={formatAmount(item.grant?.budget.maximumDailySpend)} />
          <Metric label="Monthly budget" value={formatAmount(item.grant?.budget.maximumMonthlySpend)} />
          <Metric label="Rate" value={item.grant === undefined ? 'Unavailable' : `${item.grant.rate.maximumCallsPerMinute}/min · ${item.grant.rate.maximumCallsPerHour}/hour`} />
          <Metric label="Concurrency" value={item.grant === undefined ? 'Unavailable' : String(item.grant.budget.maximumConcurrentInvocations)} />
          <Metric label="Authority" value={scopeLabel(item.key.authorityMode)} />
          <Metric label="Scopes" value={item.key.scopes.length === 0 ? 'None' : item.key.scopes.join(', ')} />
          <Metric label="Expires" value={item.key.expiresAt === undefined ? 'Not reported' : formatTimestamp(item.key.expiresAt)} />
          <Metric label="Balance" value={formatAmount(accountBalance)} />
          <Metric label="Calls" value={String(usage?.callCount ?? 0)} />
          <Metric label="Spend" value={formatAmount(usage?.grossSpend ?? zeroBalance)} />
          <Metric label="Unknown" value={usage?.states.includes('outcome_unknown') ? 'Needs review' : 'None'} />
        </dl>
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Usage and balance: {dataLabel(item.dataState)}.</p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{recovery}</p>
        <Button
          variant="secondary"
          disabled={disabled || item.key.revoked || item.key.expired}
          onClick={() => onRevoke(item.key.keyId)}
          className="min-h-11"
        >
          {revoking ? 'Revoking access…' : 'Revoke access now'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0 break-words text-foreground">{value}</dd>
    </div>
  )
}

function RecoveryItem({ title, children }: Readonly<{ title: string; children: string }>) {
  return (
    <li className="grid gap-1 py-3 first:pt-0 last:pb-0">
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-3xl text-sm text-muted-foreground">{children}</p>
    </li>
  )
}

function activityLabel(entry: CreditActivityView): string {
  if (entry.chargeState === 'free_tier') return 'Free call'
  if (entry.chargeState === 'paid') return 'Paid call'
  if (entry.chargeState === 'refunded') return 'Refunded call'
  if (entry.chargeState === 'outcome_unknown') return 'Paid call needs checking'
  return 'Call declined for insufficient credit'
}

function scopeLabel(mode: AgentAccessKeyInventoryItem['authorityMode']): string {
  if (mode === 'inspect_only') return 'Browse only'
  if (mode === 'approve_each') return 'Ask each time'
  if (mode === 'bounded_mandate') return 'Work within limits'
  return 'Custom authority'
}

function redactedKeyId(keyId: string): string {
  return keyId.length <= 8 ? '••••' : `•••• ${keyId.slice(-8)}`
}


function dataLabel(state: AgentOperatorKeyReadback['dataState']): string {
  if (state === 'source') return 'Usage details are available'
  if (state === 'empty') return 'No usage yet'
  return 'Usage details are temporarily unavailable'
}

function formatAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? '—' : formatCurrencyAmount(amount)
}
