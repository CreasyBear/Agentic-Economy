import { AeFactList, type AeFact } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { formatCurrencyAmount } from '@/modules/money/public'

export function AeOperationEconomics({
  operation,
}: Readonly<{ operation: PublicOperationDescriptor }>) {
  const breakdown = operation.commercial.priceBreakdown
  const priceEvidence = operation.commercial.priceEvidence
  const pricing = operation.commercial.price.kind === 'fixed'
    ? 'Fixed price'
    : operation.commercial.price.kind === 'range'
      ? 'Price range'
      : 'Price on request'
  const evidenceFields = operation.evidence.length
  const facts: AeFact[] = [
    { label: 'Pricing model', value: pricing },
    {
      label: 'Provider amount',
      value: breakdown === undefined ? 'Included in total' : formatCurrencyAmount(breakdown.providerQuotedAmount),
      mono: breakdown !== undefined,
    },
    {
      label: 'AE fee',
      value: breakdown === undefined ? 'Not itemized' : formatCurrencyAmount(breakdown.agenticEconomyFee),
      mono: breakdown !== undefined,
    },
    {
      label: 'Output evidence',
      value: evidenceFields === 0 ? 'None published' : `${evidenceFields} named`,
    },
    {
      label: 'Settlement',
      value: breakdown?.network ?? operation.payment?.network ?? 'Not published',
      mono: breakdown?.network !== undefined || operation.payment?.network !== undefined,
    },
    ...(priceEvidence?.observedAt === undefined
      ? []
      : [{
          label: 'Price observed',
          value: <time dateTime={timestampIso(priceEvidence.observedAt)}>{formatUtcTimestamp(priceEvidence.observedAt)} UTC</time>,
          mono: true,
        } satisfies AeFact]),
    ...(priceEvidence?.observedAt !== undefined || priceEvidence?.validUntil === undefined
      ? []
      : [{
          label: 'Quote valid until',
          value: <time dateTime={timestampIso(priceEvidence.validUntil)}>{formatUtcTimestamp(priceEvidence.validUntil)} UTC</time>,
          mono: true,
        } satisfies AeFact]),
  ]

  return (
    <div role="region" aria-label="Price and market evidence" className="grid min-w-0">
      <div className="px-gutter pb-1 pt-4">
        <h3 className="text-sm font-semibold text-foreground">
          {breakdown === undefined ? 'Call economics' : 'Price breakdown'}
        </h3>
      </div>
      <AeFactList
        density="compact"
        facts={facts}
        className="grid-cols-2 gap-x-5 gap-y-4 px-gutter pb-5 pt-3 sm:grid-cols-3 xl:grid-cols-5"
      />
    </div>
  )
}
