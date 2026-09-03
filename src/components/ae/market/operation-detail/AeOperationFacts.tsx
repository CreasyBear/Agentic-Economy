import type { ReactNode } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

import type { OperationInspectorModel } from './operation-inspector-model'

export function AeOperationFacts({
  operation,
  model,
  variant,
}: Readonly<{
  operation: PublicOperationDescriptor
  model: OperationInspectorModel
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
          ...operation.commercial.materialTerms.map((term) => ({
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
          { label: 'Provider', value: <BusinessName operation={operation} /> },
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
  operation,
}: Readonly<{ operation: PublicOperationDescriptor }>): ReactNode {
  return <span className="font-medium text-foreground">{operation.business.name}</span>
}
