import { AeFactList, type AeFact } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { formatPaymentNetwork } from '@/modules/market/tool-view-model'
import { formatCurrencyAmount, formatDisplayPrice } from '@/modules/money/public'

export function AeToolEconomics({
  tool,
}: Readonly<{ tool: PublicToolDescriptor }>) {
  const breakdown = tool.commercial.priceBreakdown
  const priceEvidence = tool.commercial.priceEvidence
  const managed = tool.authentication.kind === 'x402'
  const displayPrice = tool.commercial.displayPrice
  const audEstimate = displayPrice?.kind === 'indicative' ? formatDisplayPrice(displayPrice) : undefined
  const pricing = audEstimate === undefined
    ? tool.commercial.price.kind === 'fixed'
      ? 'Fixed price'
      : tool.commercial.price.kind === 'range'
        ? 'Price range'
        : 'Price on request'
    : breakdown === undefined
      ? `${audEstimate} per Call`
      : `${formatCurrencyAmount(breakdown.providerQuotedAmount)} · ${audEstimate} per Call`
  const evidenceFields = tool.evidence.length
  const settlementNetwork = breakdown?.network ?? tool.payment?.network
  const facts: AeFact[] = [
    { label: 'Pricing model', value: pricing },
    {
      label: 'Provider amount',
      value: breakdown === undefined ? 'Included in total' : formatCurrencyAmount(breakdown.providerQuotedAmount),
      mono: breakdown !== undefined,
    },
    {
      label: managed ? 'Call fee' : 'AE fee',
      value: managed ? 'No Call markup' : breakdown === undefined ? 'Not itemized' : formatCurrencyAmount(breakdown.agenticEconomyFee),
      mono: breakdown !== undefined,
    },
    ...(managed ? [{ label: 'Payment', value: 'Uses your AE balance' }, { label: 'Top-up fee', value: '5% fee + GST on the fee' }] : []),
    {
      label: 'Output evidence',
      value: evidenceFields === 0 ? 'None published' : `${evidenceFields} named`,
    },
    {
      label: 'Settlement',
      value: settlementNetwork === undefined ? 'Not published' : formatPaymentNetwork(settlementNetwork),
      mono: settlementNetwork !== undefined,
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
