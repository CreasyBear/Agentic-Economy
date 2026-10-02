import type {
  SettingsDangerZoneProps, SettingsEmptyStateProps, SettingsGroupProps,
  SettingsPageProps, SettingsRowProps,
} from '../settings-section.contracts'
import '../SettingsComposition.css'

export function SettingsPage({ title, description, action, children, headingRef }: SettingsPageProps) {
  return <div className="arc-market ae-settings-page">
    <header className="ae-settings-page-header">
      <div className="ae-settings-page-heading"><h2 ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1}>{title}</h2><p>{description}</p></div>
      {action && <div className="ae-settings-page-action">{action}</div>}
    </header>
    {children}
  </div>
}

export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return <section className="arc-market ae-settings-group">
    <header className="ae-settings-group-header">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </header>
    <div className="ae-settings-group-rows">{children}</div>
  </section>
}

export function SettingsRow({ label, description, children }: SettingsRowProps) {
  return <div className="arc-market ae-settings-row">
    <div className="ae-settings-row-copy"><h4>{label}</h4>{description && <p>{description}</p>}</div>
    <div className="ae-settings-row-action">{children}</div>
  </div>
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
      <h3>Danger zone</h3>
      {description && <p>{description}</p>}
    </header>
    <div className="ae-settings-danger-rows">{children}</div>
  </section>
}
