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
        className="grid-cols-[max-content_minmax(0,1fr)]"
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
    <AeFactList
      className="sm:grid-cols-3"
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
        },
        { label: 'Authentication', value: model.authenticationLabel },
        ...(model.paymentNetwork === undefined ? [] : [{ label: 'Payment network', value: model.paymentNetwork }]),
        { label: 'Readiness', value: model.readinessLabel },
      ]}
    />
  )
}

function BusinessName({
  operation,
}: Readonly<{ operation: PublicOperationDescriptor }>): ReactNode {
  return <span className="font-medium text-foreground">{operation.business.name}</span>
}
