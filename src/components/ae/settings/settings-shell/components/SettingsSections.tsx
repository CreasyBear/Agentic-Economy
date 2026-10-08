import type {
  SettingsDangerZoneProps, SettingsEmptyStateProps, SettingsGroupProps, SettingsPageProps, SettingsRowProps,
} from '../settings-section.contracts'
import { ProfileSettingsPage, ProfileSettingsSection, ProfileSettingRow } from '@/components/ae/shared/reui-pro/settings/SettingsLayout'
import '../SettingsComposition.css'

/** Every caller is a routed settings page; its pane owns the sole page heading. */
export function SettingsPage(props: SettingsPageProps) {
  return <ProfileSettingsPage {...props} />
}

export function SettingsGroup(props: SettingsGroupProps) {
  return <ProfileSettingsSection {...props} />
}

export function SettingsRow(props: SettingsRowProps) {
  return <ProfileSettingRow {...props} />
}

export function SettingsEmptyState({ title, description, action }: SettingsEmptyStateProps) {
  return <div className="arc-market ae-settings-empty-state">
    <div className="ae-settings-empty-copy"><h3>{title}</h3><p>{description}</p></div>
    {action && <div className="ae-settings-empty-action">{action}</div>}
  </div>
}

export function SettingsDangerZone({ children, description }: SettingsDangerZoneProps) {
  return <section className="arc-market ae-settings-danger-zone">
    <header className="ae-settings-danger-header">
      <h2>Danger zone</h2>
      {description && <p>{description}</p>}
    </header>
    <div className="ae-settings-danger-rows">{children}</div>
  </section>
}
