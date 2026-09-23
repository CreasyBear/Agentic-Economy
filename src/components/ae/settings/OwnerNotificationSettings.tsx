import { useState } from 'react'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'
import {
  PREFERENCE_SWITCHES,
  THRESHOLD_OPTIONS,
  UPDATE_FAILED_DIAGNOSTIC,
  lowCreditThresholdStatement,
  type NotificationPreferencePatch,
  type NotificationUpdateDiagnostic,
} from '@/modules/principal-account/notification-preferences.view-model'

import type {
  OwnerNotificationSettingsProps,
  PreferenceSwitchProps,
} from './owner-settings.contracts'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'


function PreferenceSwitch({
  id,
  label,
  checked,
  disabled,
  onToggle,
}: PreferenceSwitchProps) {
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
  disabled = false,
  onUpdate,
}: OwnerNotificationSettingsProps) {
  const [pending, setPending] = useState(false)
  const [updateDiagnostic, setUpdateDiagnostic] = useState<NotificationUpdateDiagnostic | undefined>()
  const thresholdDisabled = !preferences.lowCreditBalance

  const applyPatch = async (patch: NotificationPreferencePatch) => {
    setUpdateDiagnostic(undefined)
    setPending(true)
    try {
      await onUpdate(patch)
      toast.success('Notification preferences updated')
    } catch (cause) {
      void cause
      setUpdateDiagnostic(UPDATE_FAILED_DIAGNOSTIC)
      toast.error('Could not update notification preferences.', {
        description: 'Please check your connection and try again.',
      })
    } finally {
      setPending(false)
    }
  }

  const controlsDisabled = disabled || pending
  const thresholdControlsDisabled = thresholdDisabled || controlsDisabled

  const thresholdStatement = lowCreditThresholdStatement(preferences)

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
        <RadioGroup
          value={String(preferences.lowCreditThresholdCents)}
          onValueChange={(next) => {
            const cents = Number(next)
            if (
              Number.isNaN(cents)
              || preferences.lowCreditThresholdCents === cents
              || thresholdControlsDisabled
            ) {
              return
            }
            void applyPatch({
              lowCreditThresholdCents: cents,
              expectedRevision: preferences.revision,
            })
          }}
          disabled={thresholdControlsDisabled}
          aria-label="Low balance alert threshold"
          className="flex flex-wrap gap-2"
        >
          {THRESHOLD_OPTIONS.map(({ cents, label }) => {
            const selected = preferences.lowCreditThresholdCents === cents
            const inputId = `low-balance-threshold-${cents}`
            return (
              <Label
                key={cents}
                htmlFor={inputId}
                className={cn(
                  'flex min-h-touch cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-mono tabular-nums',
                  selected ? 'border-foreground bg-muted' : 'border-border bg-container',
                  thresholdControlsDisabled && 'opacity-50 cursor-not-allowed',
                  TACTILE,
                )}
              >
                <RadioGroupItem
                  id={inputId}
                  value={String(cents)}
                  aria-label={label}
                  disabled={thresholdControlsDisabled}
                />
                {label}
              </Label>
            )
          })}
        </RadioGroup>
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
        address in Profile.
      </p>
    </div>
  )
}
