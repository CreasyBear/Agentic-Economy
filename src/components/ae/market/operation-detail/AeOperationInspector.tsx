import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

import {
  AeOperationCompactContract,
  AeOperationContractSections,
  AeOperationTechnicalContract,
} from './AeOperationContractSections'
import { AeOperationCompactDecision } from './AeOperationCompactDecision'
import { AeOperationContinuation } from './AeOperationContinuation'
import { AeOperationDecision } from './AeOperationDecision'
import { AeOperationFacts } from './AeOperationFacts'
import { AeOperationIdentity } from './AeOperationIdentity'
import { AeOperationPosition } from './AeOperationPosition'
import { toOperationInspectorModel } from './operation-inspector-model'

export function AeOperationInspector({
  operation,
  hasBuyerCredential = false,
  variant,
}: Readonly<{
  operation: PublicOperationDescriptor
  hasBuyerCredential?: boolean
  variant: 'compact' | 'full'
}>) {
  const model = toOperationInspectorModel(operation, hasBuyerCredential)

  if (variant === 'compact') {
    return (
      <article data-operation-inspector="compact" className="grid min-w-0">
        <AeOperationIdentity operation={operation} variant="compact" />
        <div className="grid gap-related px-gutter py-related">
          <p className="text-pretty text-sm text-foreground">{model.summary}</p>
          <AeOperationCompactDecision operation={operation} model={model} />
          <AeOperationPosition operation={operation} />
          <AeOperationCompactContract operation={operation} model={model} />
        </div>
      </article>
    )
  }

  return (
    <article data-operation-inspector="full" className="ae-rail grid gap-8 pb-page">
      <header className="grid gap-4">
        <AeOperationIdentity operation={operation} variant="full" />
        <AeOperationDecision model={model} />
        <AeOperationFacts operation={operation} model={model} variant="full" />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <AeOperationContractSections operation={operation} model={model} />
        <AeOperationContinuation model={model} variant="full" />
      </div>

      <AeOperationTechnicalContract operation={operation} />
    </article>
  )
}
