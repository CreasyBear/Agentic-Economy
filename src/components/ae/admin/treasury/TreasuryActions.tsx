import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/arc/input/input'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'
import { formatTimestamp } from '@/lib/ui/format-time'
import type { AdminTreasuryView } from '@/modules/money/treasury-report'
import { useTreasuryActions } from './useTreasuryActions'
import { treasuryMoney } from './treasury-view-model'

const audienceLabel = (audience: 'admins' | 'everyone') => audience === 'admins' ? 'admins only' : 'everyone'
export function TreasuryActions({ view }: { view: AdminTreasuryView }) {
  const state = useTreasuryActions(view)
  const thresholdAction = state.action === 'thresholds'
  const resume = state.action === 'resume'
  const approvalRequired = resume && state.receipt?.kind === 'refused' && state.receipt.code === 'approval_required'
  const propose = resume && state.review.resumeRequiresApproval
  const refused = state.receipt?.kind === 'refused' ? ADMIN_REFUSAL_PRESENTATION[state.receipt.code] : null
  const retryable = state.unknown || state.receipt?.kind === 'pending' || (refused !== null && refused.retry !== 'no' && !state.targetChanged)
  const locked = state.pending || state.unresolved
  const current = state.targetChanged || approvalRequired ? view.controls : state.review
  return <AeSection title="Actions" description="Refill the company wallet or change the controls for new purchases.">
    <div className="grid gap-related rounded-card border border-border p-related">
      <h3 className="font-medium">Refill the float</h3>
      {view.custody === null ? <AeInlineState state="unavailable" label="Deposit address unavailable" description="Custody must be configured before refill details can be shown." /> : <>
        <p className="text-sm text-muted-foreground">Send USDC on {view.environment === 'production' ? 'Base' : 'Base Sepolia (test network)'} · {view.custody.network}.</p>
        <div className="grid gap-intra"><span className="text-sm font-medium">Deposit address</span><AeCopyReference label="deposit address" value={view.custody.address} /></div>
        <div className="grid gap-intra"><span className="text-sm font-medium">USDC contract</span><AeCopyReference label="USDC contract" value={view.custody.asset} /></div>
        {/* TODO: add a local QR renderer only after the dependency decision; encode the exact displayed address. */}
        <p className="text-xs text-muted-foreground">Confirmed deposits are booked automatically. No outbound wallet transfer is available here.</p>
      </>}
    </div>
    <div className="flex flex-wrap gap-related">
      <Button type="button" variant={state.paused ? 'primary' : 'secondary'} disabled={!view.controls.canManage || locked} onClick={() => state.open(state.paused ? 'resume' : 'pause')}>
        {state.paused ? (view.controls.resumeRequiresApproval ? 'Propose resuming payments' : 'Resume payments') : 'Pause payments'}
      </Button>
      <Button type="button" variant="secondary" disabled={!view.controls.canManage || locked} onClick={() => state.open('thresholds')}>Edit thresholds</Button>
    </div>
    {!view.controls.canManage ? <p className="text-sm text-muted-foreground">An Admin owner can change payment controls and thresholds.</p> : null}
    {state.receipt?.kind === 'completed' ? <AeAlert tone="info" title={state.receipt.action === 'change_treasury_thresholds' ? 'Treasury thresholds saved' : state.receipt.code === 'payments_paused' ? 'Payments paused' : 'Payments resumed'} role="status"><a href="/admin/audit-events" className="underline underline-offset-4">View the audit record</a></AeAlert> : null}
    {state.receipt?.kind === 'proposed' ? <AeAlert tone="info" title="Awaiting another Admin owner" role="status">
      <p>Payments remain paused until the proposal is approved. Expires {formatTimestamp(state.receipt.expiresAt)}.</p>
      <AeCopyReference label="proposal reference" value={state.receipt.proposalRef} />
      <a href="/admin/audit-events" className="underline underline-offset-4">Open the proposal in Audit</a>
    </AeAlert> : null}
    <Dialog open={state.action !== null} onOpenChange={open => { if (!open) state.close() }}>
      <DialogContent className="arc-market" showCloseButton={!locked}>
        <DialogHeader>
          <DialogTitle>{thresholdAction ? 'Edit treasury thresholds' : resume ? (propose ? 'Propose resuming payments' : 'Resume payments?') : 'Pause new purchases?'}</DialogTitle>
          <DialogDescription>{thresholdAction ? 'Save fixed USDC amounts. This replaces the automatic runway-day thresholds.' : resume ? `Restore new purchases for ${audienceLabel(current.resumePaymentsOpenTo)}. ${propose || approvalRequired ? 'Another Admin owner must approve this proposal.' : 'Accepted Calls keep their existing authority.'}` : 'New purchases will pause. Accepted Calls will continue or reconcile.'}</DialogDescription>
        </DialogHeader>
        <p className="text-sm font-medium">{view.environment === 'production' ? 'Production · Base' : 'Sandbox · Base Sepolia'}</p>
        <div className="grid gap-intra rounded-md border border-border p-related">
          <h3 className="text-sm font-medium">Current settings</h3>
          {thresholdAction ? <AeFactList density="compact" facts={current.thresholds.kind === 'fixed' ? [
            { label: 'Current low-water mark', value: treasuryMoney(current.thresholds.lowWaterUnits) },
            { label: 'Current target float', value: treasuryMoney(current.thresholds.targetFloatUnits) },
          ] : [
            { label: 'Current low-water mark', value: `${current.thresholds.lowWaterDays} days of runway` },
            { label: 'Current target float', value: `${current.thresholds.targetDays} days of runway` },
          ]} /> : <AeFactList density="compact" facts={[
            { label: 'New purchases', value: current.paymentsOpenTo === 'none' ? 'Paused' : `Open to ${audienceLabel(current.paymentsOpenTo)}` },
            { label: 'Saved resume audience', value: audienceLabel(current.resumePaymentsOpenTo) },
          ]} />}
        </div>
        {thresholdAction ? <div className="grid gap-related">
          <Input label="Low-water mark (USDC)" id="treasury-low-water" inputMode="decimal" type="text" value={state.lowWater} disabled={locked || state.targetChanged} onChange={event => state.edit('lowWater', event.target.value)} />
          <Input label="Target float (USDC)" id="treasury-target" inputMode="decimal" type="text" value={state.target} disabled={locked || state.targetChanged} onChange={event => state.edit('target', event.target.value)} />
        </div> : null}
        {state.error === null ? null : <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {refused === null ? null : <p role="alert" className="text-sm text-destructive">{refused.copy}{state.targetChanged ? ' Review the current settings before submitting again.' : ''}</p>}
        {state.receipt?.kind === 'pending' ? <AeInlineState state="pending" label="Command pending" description="Recover this command's receipt before starting another change." /> : null}
        {state.pending ? <AeInlineState state="saving" label="Submitting" description="Complete MFA if prompted. Waiting for the command receipt." /> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={locked} onClick={state.close}>Cancel</Button>
          {state.targetChanged ? <Button type="button" onClick={state.reviewCurrent}>Review current settings</Button> : approvalRequired ? <Button type="button" disabled={locked || !view.controls.canManage} onClick={state.proposeResume}>Submit proposal</Button> : retryable ? <Button type="button" disabled={state.pending || !view.controls.canManage} onClick={state.retry}>{state.unknown ? 'Recover command result' : 'Retry command'}</Button> : <Button type="button" disabled={state.pending || !view.controls.canManage || (refused?.retry === 'no')} onClick={() => void state.submit()}>{thresholdAction ? 'Save fixed thresholds' : propose ? 'Submit proposal' : resume ? 'Resume payments' : 'Pause payments'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AeSection>
}
