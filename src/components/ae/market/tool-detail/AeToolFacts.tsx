import type { ReactNode } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'

import type { ToolInspectorModel } from './tool-inspector-model'

export function AeToolFacts({
  tool,
  model,
  variant,
}: Readonly<{
  tool: PublicToolDescriptor
  model: ToolInspectorModel
  variant: 'compact' | 'full'
}>) {
  if (variant === 'compact') {
    return (
      <AeFactList
        density="compact"
        className="grid-cols-1 sm:grid-cols-2"
        facts={[
          { label: 'Access', value: model.authenticationLabel },
          ...(model.paymentNetwork === undefined ? [] : [{ label: 'Payment network', value: model.paymentNetwork }]),
          ...(model.readinessLabel === model.decisionLabel
            ? []
            : [{ label: 'Readiness', value: model.readinessLabel }]),
          ...tool.commercial.materialTerms.map((term) => ({
            label: term.label,
            value: term.value,
          })),
        ]}
      />
    )
  }

  return (
    <section aria-label="Provider and access" className="min-w-0 px-gutter py-6">
      <div className="mb-4 flex min-w-0 items-baseline justify-between gap-related">
        <h2 className="text-sm font-semibold text-foreground">Provider and access</h2>
        <p className="shrink-0 text-xs text-muted-foreground">Current catalog facts</p>
      </div>
      <AeFactList
        density="compact"
        className="grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3"
        facts={[
          { label: 'Provider', value: <BusinessName tool={tool} /> },
          {
            label: 'Last verified',
            value: model.lastVerifiedAt === undefined
              ? 'Not published'
              : (
                  <time dateTime={timestampIso(model.lastVerifiedAt)}>
                    {formatUtcTimestamp(model.lastVerifiedAt)} UTC
                  </time>
                ),
            mono: model.lastVerifiedAt !== undefined,
          },
          { label: 'Authentication', value: model.authenticationLabel },
          ...(model.paymentNetwork === undefined ? [] : [{ label: 'Payment network', value: model.paymentNetwork, mono: true }]),
          { label: 'Readiness', value: model.readinessLabel },
        ]}
      />
    </section>
  )
}

function BusinessName({
  tool,
}: Readonly<{ tool: PublicToolDescriptor }>): ReactNode {
  return <span className="font-medium text-foreground">{tool.business.name}</span>
}
