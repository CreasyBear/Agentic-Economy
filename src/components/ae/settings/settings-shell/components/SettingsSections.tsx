import type {
  SettingsDangerZoneProps, SettingsEmptyStateProps,
} from '../settings-section.contracts'
import '../SettingsComposition.css'

export {
  SettingsPagePane as SettingsPage,
  SettingsPageGroup as SettingsGroup,
  SettingsPageRow as SettingsRow,
} from '@/components/arc/blocks/settings-page/settings-page'

export function SettingsEmptyState({ title, description, action }: SettingsEmptyStateProps) {
  return <div className="arc-market ae-settings-empty-state">
    <div className="ae-settings-empty-copy"><h3>{title}</h3><p>{description}</p></div>
    {action && <div className="ae-settings-empty-action">{action}</div>}
  </div>
}

export function SettingsDangerZone({ children, description }: SettingsDangerZoneProps) {
  return <section className="arc-market ae-settings-danger-zone">
    <header className="ae-settings-danger-header">
      <h3>Danger zone</h3>
      {description && <p>{description}</p>}
    </header>
    <div className="ae-settings-danger-rows">{children}</div>
  </section>
}
