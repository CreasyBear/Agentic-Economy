
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

type OwnerNotificationSettingsProps = Readonly<{
  preferences: NotificationPreferencesView
  onUpdate: (patch: NotificationPreferencePatch) => void
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
  { cents: 1000, label: '$10' },
  { cents: 2500, label: '$25' },
  { cents: 5000, label: '$50' },
]

function PreferenceSwitch({
  label,
  checked,
  onToggle,
}: Readonly<{
  label: string
  checked: boolean
  onToggle: () => void
}>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="relative inline-flex h-6 w-11 shrink-0 rounded-full border border-input bg-muted transition-colors data-[state=on]:bg-primary"
        data-state={checked ? 'on' : 'off'}
        onClick={onToggle}
      >
        <span
          className="pointer-events-none block size-5 translate-x-0.5 rounded-full border border-border bg-background shadow-none transition-transform data-[state=on]:translate-x-[1.375rem]"
          data-state={checked ? 'on' : 'off'}
        />
      </button>
    </div>
  )
}

export function OwnerNotificationSettings({
  preferences,
  onUpdate,
}: OwnerNotificationSettingsProps) {
  const thresholdDisabled = !preferences.lowCreditBalance

  return (
    <div className="grid gap-section">
      <h2 className="text-lg font-semibold tracking-tight">Email alerts</h2>
      <div className="grid gap-4">
        {PREFERENCE_SWITCHES.map(({ key, label }) => (
          <PreferenceSwitch
            key={key}
            label={label}
            checked={preferences[key]}
            onToggle={() => {
              onUpdate({
                [key]: !preferences[key],
                expectedRevision: preferences.revision,
              })
            }}
          />
        ))}
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Low balance alert threshold</p>
        <fieldset disabled={thresholdDisabled} className="flex flex-wrap gap-4 border-0 p-0">
          {THRESHOLD_OPTIONS.map(({ cents, label }) => (
            <label key={cents} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="lowCreditThresholdCents"
                value={cents}
                checked={preferences.lowCreditThresholdCents === cents}
                disabled={thresholdDisabled}
                aria-label={label}
                onChange={() => {
                  onUpdate({
                    lowCreditThresholdCents: cents,
                    expectedRevision: preferences.revision,
                  })
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
      <p className="text-muted-foreground text-sm">
        Alerts are sent to the primary email verified in your Clerk profile. Update your email
        address in the Profile section above.
      </p>
    </div>
  )
}
