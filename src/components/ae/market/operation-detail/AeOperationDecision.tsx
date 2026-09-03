import { AeOperationPrice } from '@/components/ae/market/AeOperationPrice'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

import { AeOperationEconomics } from './AeOperationEconomics'
import type { OperationInspectorModel } from './operation-inspector-model'

export function AeOperationDecision({
  operation,
  model,
}: Readonly<{
  operation: PublicOperationDescriptor
  model: OperationInspectorModel
}>) {
  return (
    <section
      aria-label={model.decisionLabel}
      className="min-w-0 border-b border-border bg-card"
    >
      <div className="grid min-w-0 gap-6 px-gutter py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-pretty text-lg font-semibold leading-7 tracking-tight text-foreground sm:text-xl sm:leading-8">
            {model.summary}
          </h2>
        </div>
        <AeOperationPrice
          price={model.totalPrice}
          size="lg"
          label="Indicative price"
          className="border-t border-border pt-4 sm:min-w-40 sm:border-s sm:border-t-0 sm:py-1 sm:ps-6 sm:text-end"
        />
      </div>

      <div className="border-t border-border">
        <AeOperationEconomics operation={operation} />
      </div>
    </section>
  )
}
