import { AeSection } from '@/components/ae/layout/AeSection'
import {
  ADMIN_OVERVIEW_COPY,
  type AdminOverviewConfiguration,
} from '../overview.contracts'

export type ConfigurationBannerProps = Readonly<{ configuration: AdminOverviewConfiguration }>

export function ConfigurationBanner({ configuration }: ConfigurationBannerProps) {
  const rows = [
    [ADMIN_OVERVIEW_COPY.formance, configuration.formance === 'configured'
      ? ADMIN_OVERVIEW_COPY.configured : configuration.formance === 'unavailable'
        ? ADMIN_OVERVIEW_COPY.unavailable : ADMIN_OVERVIEW_COPY.notConfigured],
    [ADMIN_OVERVIEW_COPY.x402Custody, configuration.x402Custody === 'configured'
      ? ADMIN_OVERVIEW_COPY.configured : ADMIN_OVERVIEW_COPY.notConfigured],
    [ADMIN_OVERVIEW_COPY.clerkFva, configuration.clerkFva === 'present'
      ? ADMIN_OVERVIEW_COPY.present : ADMIN_OVERVIEW_COPY.absent],
    [ADMIN_OVERVIEW_COPY.convex, ADMIN_OVERVIEW_COPY.ok],
  ] as const
  return (
    <AeSection
      title={ADMIN_OVERVIEW_COPY.configurationTitle}
      description={ADMIN_OVERVIEW_COPY.configurationDescription}
    >
      <dl className="grid gap-related sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-card border border-border bg-card p-related">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-intra font-medium text-foreground">{label}: {value}</dd>
          </div>
        ))}
      </dl>
    </AeSection>
  )
}
