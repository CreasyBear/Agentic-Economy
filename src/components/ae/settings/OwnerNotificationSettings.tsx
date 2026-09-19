import { useState } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'
import { AUD_EXPONENT, formatDisplayAmount, rescaleExactAmount } from '@/modules/money/public'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type NotificationPreferencesView = Readonly<{
  lowCreditBalance: boolean
  lowCreditThresholdCents: number
  spendCapWarning: boolean
  callFailureSpike: boolean
  invoiceReady: boolean
  teamMembershipChanged: boolean
  revision: number
}>

export type NotificationPreferencePatch = Readonly<{
  lowCreditBalance?: boolean
  lowCreditThresholdCents?: number
  spendCapWarning?: boolean
  callFailureSpike?: boolean
  invoiceReady?: boolean
  teamMembershipChanged?: boolean
  expectedRevision: number
}>

const UPDATE_FAILED_DIAGNOSTIC = {
  whatHappened: 'Could not update notification preferences.',
  financialImpact: 'A$0.00 affected — existing preferences remain active.',
  nextStep: 'Please check your connection and try again.',
} as const

type OwnerNotificationSettingsProps = Readonly<{
  preferences: NotificationPreferencesView
  onUpdate: (patch: NotificationPreferencePatch) => void | Promise<void>
}>

type PreferenceSwitchKey =
  | 'lowCreditBalance'
  | 'spendCapWarning'
  | 'callFailureSpike'
  | 'invoiceReady'
  | 'teamMembershipChanged'

const PREFERENCE_SWITCHES: ReadonlyArray<{
  key: PreferenceSwitchKey
  label: string
}> = [
  { key: 'lowCreditBalance', label: 'Low credit balance' },
  { key: 'spendCapWarning', label: 'Spend cap warning' },
  { key: 'callFailureSpike', label: 'Repeated call failures' },
  { key: 'invoiceReady', label: 'Tax invoice or statement ready' },
  { key: 'teamMembershipChanged', label: 'Team membership changes' },
]

const THRESHOLD_OPTIONS: ReadonlyArray<{ cents: number; label: string }> = [
  { cents: 1000, label: 'A$10.00' },
  { cents: 2500, label: 'A$25.00 (Default)' },
  { cents: 5000, label: 'A$50.00' },
]

function thresholdDisplayUnits(cents: number): string {
  const exact = rescaleExactAmount(
    { currency: 'AUD', units: String(cents), exponent: 2 },
    AUD_EXPONENT,
  )
  return exact?.units ?? String(cents * 10_000)
}

function PreferenceSwitch({
  id,
  label,
  checked,
  disabled,
  onToggle,
}: Readonly<{
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal text-foreground">
        {label}
      </Label>
      <Switch
        id={id}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        className={TACTILE}
        onCheckedChange={() => onToggle()}
      />
    </div>
  )
}

export function OwnerNotificationSettings({
  preferences,
  onUpdate,
}: OwnerNotificationSettingsProps) {
  const [pending, setPending] = useState(false)
  const [updateDiagnostic, setUpdateDiagnostic] = useState<typeof UPDATE_FAILED_DIAGNOSTIC | undefined>()
  const thresholdDisabled = !preferences.lowCreditBalance

  const applyPatch = async (patch: NotificationPreferencePatch) => {
    setUpdateDiagnostic(undefined)
    setPending(true)
    try {
      await onUpdate(patch)
      toast.success('Notification preferences updated')
    } catch {
      setUpdateDiagnostic(UPDATE_FAILED_DIAGNOSTIC)
      toast.error('Could not update notification preferences.', {
        description: 'Please check your connection and try again.',
      })
    } finally {
      setPending(false)
    }
  }

  const controlsDisabled = pending
  const thresholdControlsDisabled = thresholdDisabled || pending

  const thresholdStatement = preferences.lowCreditBalance
    ? `Alert sent when balance drops below ${formatDisplayAmount({
        currency: 'AUD',
        exponent: AUD_EXPONENT,
        units: thresholdDisplayUnits(preferences.lowCreditThresholdCents),
      })}.`
    : 'Low-balance alerts are off. Existing spend and call alerts are unchanged.'

  return (
    <div className="grid gap-section">
      <div className="grid gap-4">
        {PREFERENCE_SWITCHES.map(({ key, label }) => (
          <PreferenceSwitch
            key={key}
            id={`preference-${key}`}
            label={label}
            checked={preferences[key]}
            disabled={controlsDisabled}
            onToggle={() => {
              void applyPatch({
                [key]: !preferences[key],
                expectedRevision: preferences.revision,
              })
            }}
          />
        ))}
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Low balance alert threshold</p>
        <div
          role="radiogroup"
          aria-label="Low balance alert threshold"
          className="flex flex-wrap gap-2"
        >
          {THRESHOLD_OPTIONS.map(({ cents, label }) => {
            const selected = preferences.lowCreditThresholdCents === cents
            return (
              <button
                key={cents}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                disabled={thresholdControlsDisabled}
                className={cn(
                  'min-h-touch rounded-md border px-3 py-2 text-sm font-mono tabular-nums',
                  selected ? 'border-foreground bg-muted' : 'border-border bg-container',
                  thresholdControlsDisabled && 'opacity-50',
                  TACTILE,
                )}
                onClick={() => {
                  if (selected || thresholdControlsDisabled) return
                  void applyPatch({
                    lowCreditThresholdCents: cents,
                    expectedRevision: preferences.revision,
                  })
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div
          className="min-h-[2.5rem] font-mono text-sm tabular-nums text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {thresholdStatement}
        </div>
      </div>
      <div className="min-h-[2.5rem]" role="status" aria-live="polite">
        {updateDiagnostic ? (
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>
              <strong>What happened:</strong> {updateDiagnostic.whatHappened}
            </p>
            <p className="font-mono text-xs tabular-nums">
              <strong>Financial impact:</strong> {updateDiagnostic.financialImpact}
            </p>
            <p>
              <strong>Next step:</strong> {updateDiagnostic.nextStep}
            </p>
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">
        Alerts are sent to the primary email verified in your Clerk profile. Update your email
        address in the Profile section above.
      </p>
    </div>
  )
}
