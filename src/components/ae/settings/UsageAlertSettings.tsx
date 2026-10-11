import { useRef, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/ui/input'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { SettingsGroup, SettingsRow } from './settings-shell/components/SettingsSections'
import type { NotificationPreferencePatch, UsageAlertPolicy } from '@/modules/principal-account/notification-preferences.view-model'

const valuesFor = (policy: UsageAlertPolicy | undefined) => ({
  failure: String(policy?.failurePercent ?? 20), minimum: String(policy?.minimumCalls ?? 20), spend: String(policy?.spendWarningPercent ?? 80),
})
const sameValues = (left: ReturnType<typeof valuesFor>, right: ReturnType<typeof valuesFor>) =>
  left.failure === right.failure && left.minimum === right.minimum && left.spend === right.spend
const valid = (value: string, max: number) => /^\d+$/u.test(value) && Number(value) >= 1 && Number(value) <= max

export function UsageAlertSettings({ policy, disabled, onUpdate, revision }: {
  policy: UsageAlertPolicy | undefined; disabled: boolean; revision: number
  onUpdate: (patch: NotificationPreferencePatch) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(() => valuesFor(policy))
  const [baseline, setBaseline] = useState(() => valuesFor(policy))
  const [observed, setObserved] = useState(() => valuesFor(policy))
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'idle' | 'saved' | 'outcome_unknown'>('idle')
  const saveRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const current = valuesFor(policy)
  if (!sameValues(current, observed)) {
    setObserved(current)
    if (!pending && sameValues(draft, baseline)) setDraft(current)
    setBaseline(current)
  }
  const dirty = !sameValues(draft, baseline)
  const invalid = !valid(draft.failure, 100) || !valid(draft.minimum, 100000) || !valid(draft.spend, 100)
  async function save(enabled: boolean) {
    if (disabled || pending || (enabled && invalid)) return
    setPending(true); setOutcome('idle')
    const accepted = await onUpdate({ expectedRevision: revision, usageAlertPolicy: {
      enabled, failurePercent: enabled ? Number(draft.failure) : policy?.failurePercent ?? 20,
      minimumCalls: enabled ? Number(draft.minimum) : policy?.minimumCalls ?? 20,
      spendWarningPercent: enabled ? Number(draft.spend) : policy?.spendWarningPercent ?? 80,
    } })
    if (accepted && enabled) setBaseline(draft)
    setOutcome(accepted ? 'saved' : 'outcome_unknown'); setPending(false)
  }
  return <AeNavigationSafetyBoundary state={{ dirty: dirty || pending || outcome === 'outcome_unknown', pending, saveOutcome: outcome }}
    title="Leave usage alert settings?" pendingTitle="Usage alerts are still saving"
    description={outcome === 'outcome_unknown' ? 'The update could not be confirmed. Check the saved settings when you return.' : 'Your unsaved alert thresholds will be discarded.'}
    pendingDescription="Wait for the settings update before leaving." saveActionRef={saveRef} headingRef={inputRef}>
    <SettingsGroup title="Usage alerts" description="Choose when completed Calls and reports should trigger an email. These alerts never change spending authority.">
      <SettingsRow label="Call outcome threshold (%)" description="Alert when refused or uncertain Calls reach this share of a complete monthly report.">
        <Input ref={inputRef} aria-label="Call outcome threshold percent" aria-invalid={!valid(draft.failure, 100)} inputMode="numeric" value={draft.failure} disabled={disabled} onChange={event => { setDraft({ ...draft, failure: event.target.value }); setOutcome('idle') }} />
      </SettingsRow>
      <SettingsRow label="Minimum Calls" description="Wait for this many Calls before evaluating the outcome threshold.">
        <Input aria-label="Minimum Calls for alert" aria-invalid={!valid(draft.minimum, 100000)} inputMode="numeric" value={draft.minimum} disabled={disabled} onChange={event => { setDraft({ ...draft, minimum: event.target.value }); setOutcome('idle') }} />
      </SettingsRow>
      <SettingsRow label="Monthly ceiling warning (%)" description="Alert at this share of your enabled spending ceiling.">
        <Input aria-label="Monthly ceiling warning percent" aria-invalid={!valid(draft.spend, 100)} inputMode="numeric" value={draft.spend} disabled={disabled} onChange={event => { setDraft({ ...draft, spend: event.target.value }); setOutcome('idle') }} />
      </SettingsRow>
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-sm"><strong>{policy?.enabled === true ? 'Enabled' : 'Disabled'}</strong> · Saving and enabling records your consent. A change of workspace owner requires renewed consent.</p>
        <details className="text-sm text-muted-foreground">
          <summary className="min-h-11 cursor-pointer content-center font-medium">When alerts are evaluated</summary>
          <p className="pt-2 leading-relaxed">Evaluation follows completed Calls and reports, subject to rate limits; this is not continuous monitoring. Financial warnings use reconciled effective-date spending and available credit. Refunds and promotional credits remain separate. Low-credit alerts use the saved threshold; document alerts require an issued monthly statement.</p>
        </details>
        {invalid ? <p role="alert" className="text-sm text-destructive">Enter percentages from 1 to 100 and a minimum of 1 to 100,000 Calls.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button ref={saveRef} type="button" variant="primary" disabled={disabled || invalid} onClick={() => void save(true)}>Save and enable usage alerts</Button>
          {policy?.enabled === true ? <Button type="button" variant="secondary" disabled={disabled} onClick={() => void save(false)}>Disable usage alerts</Button> : null}
        </div>
      </div>
    </SettingsGroup>
  </AeNavigationSafetyBoundary>
}
