import type {
  SettingsDangerZoneProps, SettingsEmptyStateProps, SettingsGroupProps, SettingsPageProps, SettingsRowProps,
} from '../settings-section.contracts'
import { SettingsPageGroup, SettingsPagePane, SettingsPageRow } from '@/components/arc/blocks/settings-page/settings-page'
import '../SettingsComposition.css'

/** Every caller is a routed settings page; its pane owns the sole page heading. */
export function SettingsPage(props: SettingsPageProps) {
  return <SettingsPagePane {...props} headingLevel={1} />
}

export function SettingsGroup(props: SettingsGroupProps) {
  return <SettingsPageGroup {...props} headingLevel={2} />
}

export function SettingsRow(props: SettingsRowProps) {
  return <SettingsPageRow {...props} headingLevel={3} />
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
