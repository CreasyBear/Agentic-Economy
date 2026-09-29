import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import type {
  SettingsDangerZoneProps, SettingsEmptyStateProps, SettingsGroupProps,
  SettingsPageProps, SettingsRowProps,
} from '../settings-section.contracts'

export function SettingsPage({ title, description, action, children, headingRef }: SettingsPageProps) {
  return <div className="grid min-w-0 gap-8">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
      <div className="grid min-w-0 gap-1"><h2 ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1} className="text-2xl font-semibold tracking-tight text-foreground focus:outline-none">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>
      {action}
    </header>
    {children}
  </div>
}

export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return <Card><CardHeader><CardTitle><h3>{title}</h3></CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent className="grid min-w-0"><Separator />{children}</CardContent></Card>
}

export function SettingsRow({ label, description, children }: SettingsRowProps) {
  return <div className="flex min-w-0 flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
    <div className="min-w-0"><h4 className="text-sm font-medium text-foreground">{label}</h4>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
    <div className="min-w-0 shrink-0 text-sm text-foreground sm:text-right">{children}</div>
  </div>
}

export function SettingsEmptyState({ title, description, action }: SettingsEmptyStateProps) {
  return <Empty><EmptyHeader><EmptyTitle><h3>{title}</h3></EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>
}

export function SettingsDangerZone({ children, description }: SettingsDangerZoneProps) {
  return <Card className="border-destructive/50"><CardHeader><CardTitle className="text-destructive"><h3>Danger zone</h3></CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent>{children}</CardContent></Card>
}
