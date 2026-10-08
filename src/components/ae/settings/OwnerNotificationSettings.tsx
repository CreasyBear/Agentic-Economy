import {UsageAlertHistory} from './UsageAlertHistory'
import { UsageAlertSettings } from './UsageAlertSettings'
import { useRef,useState } from 'react'

import { SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Switch } from '@base-ui/react/switch'
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
import './NotificationSettingsComposition.css'

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
      <Switch.Root
        id={id}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        nativeButton
        render={<button type="button" />}
        className="arc-market arc-notification-switch"
        onCheckedChange={onToggle}
      >
        <span className="arc-notification-track" aria-hidden="true">
          <Switch.Thumb className="arc-notification-thumb" />
        </span>
      </Switch.Root>
    </SettingsRow>
  )
}

export function OwnerNotificationSettings({
  preferences,
  disabled = false,
  onUpdate,
}: OwnerNotificationSettingsProps) {
  const inFlight=useRef(false)
  const [pending, setPending] = useState(false)
  const [updateDiagnostic, setUpdateDiagnostic] = useState<NotificationUpdateDiagnostic | undefined>()

  const applyPatch = async (patch: NotificationPreferencePatch) => {
    if(inFlight.current)return false
    inFlight.current=true
    setUpdateDiagnostic(undefined)
    setPending(true)
    try {
      await onUpdate(patch)
      toast.success('Notification preferences updated')
      return true
    } catch (cause) {
      void cause
      setUpdateDiagnostic(UPDATE_FAILED_DIAGNOSTIC)
      toast.error('Could not update notification preferences.', {
        description: 'Check the saved preferences before trying again.',
      })
      return false
    } finally {
      inFlight.current=false
      setPending(false)
    }
  }

  const controlsDisabled = disabled || pending
  return (
    <div className="arc-market arc-notification-settings">
      <UsageAlertSettings policy={preferences.usageAlertPolicy} disabled={controlsDisabled} revision={preferences.revision} onUpdate={applyPatch} />
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
      <UsageAlertHistory />
      <div className="arc-notification-status" role="status" aria-live="polite">
        {updateDiagnostic ? (
          <div className="arc-notification-diagnostic">
            <p>
              <strong>What happened:</strong> {updateDiagnostic.whatHappened}
            </p>
            <p className="arc-notification-impact">
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
