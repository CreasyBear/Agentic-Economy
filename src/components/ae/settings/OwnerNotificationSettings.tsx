import { useState } from 'react'

import { SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/lib/ui/toast'
import {
  PREFERENCE_SWITCHES,
  UPDATE_FAILED_DIAGNOSTIC,
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
  description,
  checked,
  disabled,
  onToggle,
}: PreferenceSwitchProps) {
  return (
    <SettingsRow label={label} description={description}>
      <Switch
        id={id}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        className={TACTILE}
        onCheckedChange={onToggle}
      />
    </SettingsRow>
  )
}

export function OwnerNotificationSettings({
  preferences,
  disabled = false,
  onUpdate,
}: OwnerNotificationSettingsProps) {
  const [pending, setPending] = useState(false)
  const [updateDiagnostic, setUpdateDiagnostic] = useState<NotificationUpdateDiagnostic | undefined>()

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
  return (
    <div className="grid min-w-0 gap-6">
      {PREFERENCE_SWITCHES.length > 0 ? (
        <SettingsGroup title="Email alerts" description="Sent to the primary email verified in your Profile.">
          {PREFERENCE_SWITCHES.map(({ key, label, description }) => (
            <PreferenceSwitch
              key={key}
              id={`preference-${key}`}
              label={label}
              description={description}
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
        </SettingsGroup>
      ) : null}
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
    </div>
  )
}
