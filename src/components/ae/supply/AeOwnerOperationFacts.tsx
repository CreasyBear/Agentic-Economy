import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatExactAmount } from '@/modules/money/public'
import type { OwnerSupplyOfferingReadback } from '@/modules/capability-supply/supply-funnel.functions'

export function AeOwnerOperationFacts({
  offering,
  detail = false,
}: Readonly<{ offering: OwnerSupplyOfferingReadback; detail?: boolean }>) {
  const publication = offering.publication
  const source = publication?.source ?? offering.source
  const pricing = publication?.pricing ?? offering.pricing
  const readiness = publication?.readiness ?? offering.readiness
  const lifecycle = publication?.lifecycle ?? offering.lifecycle
  const binding = publication?.binding
  const paidAmount = pricing?.config.paidAmount
  const price = paidAmount === undefined
    ? 'Not published'
    : `${paidAmount.currency} ${formatExactAmount(paidAmount) ?? '—'} · units ${paidAmount.units} · exponent ${paidAmount.exponent}`
  const readinessWindow = [
    readiness.observedAt === undefined ? undefined : `observed ${new Date(readiness.observedAt).toISOString()}`,
    readiness.validUntil === undefined ? undefined : `valid until ${new Date(readiness.validUntil).toISOString()}`,
  ].filter((value): value is string => value !== undefined).join(' · ')

  const facts = [
    { label: 'Operation', value: `${offering.offeringRef} · revision ${offering.revision}` },
    { label: 'Operation ref', value: publication?.operationRef ?? 'Not published' },
    { label: 'Publication', value: publication === undefined ? 'Not published' : `${publication.publicationRef} · revision ${publication.publicationRevision}` },
    { label: 'Binding ID', value: binding?.bindingId ?? 'Not published' },
    { label: 'Adapter', value: binding?.adapterId ?? 'Not published' },
    { label: 'Endpoint', value: binding?.endpointUrl ?? offering.endpointUrl ?? 'Not supplied' },
    { label: 'Source', value: source === undefined ? 'Not supplied' : `${source.kind} · ${source.revision}` },
    { label: 'Source digest', value: source?.digest ?? 'Not supplied' },
    { label: 'Pricing config', value: pricing === undefined ? 'Not published' : `${pricing.config.version} · ${pricing.config.unit}` },
    { label: 'Exact price', value: price },
    { label: 'Price digest', value: pricing?.priceDigest ?? 'Not published' },
    { label: 'Readiness', value: readiness.outcome },
    { label: 'Readiness window', value: readinessWindow || 'Unobserved' },
    { label: 'Readiness evidence', value: readiness.evidenceRefs.length === 0 ? 'None recorded' : readiness.evidenceRefs.join(', ') },
    { label: 'Readiness target digest', value: publication?.readiness.targetDigest ?? 'Not recorded' },
    { label: 'Readiness request digest', value: publication?.readiness.requestDigest ?? 'Not recorded' },
    { label: 'Readiness response', value: publication?.readiness.responseStatus === undefined ? 'Not recorded' : `${publication.readiness.responseStatus}${publication.readiness.responseContentType === undefined ? '' : ` · ${publication.readiness.responseContentType}`}` },
    { label: 'Readiness response digest', value: publication?.readiness.responseDigest ?? 'Not recorded' },
    { label: 'Lifecycle', value: lifecycle.reasons.length === 0 ? lifecycle.state : `${lifecycle.state} · ${lifecycle.reasons.join(', ')}` },
    { label: 'Live status', value: offering.live.available ? 'available' : `unavailable${offering.live.reason === undefined ? '' : ` · ${offering.live.reason}`}` },
  ] as const

  return <AeFactList facts={facts} density={detail ? 'default' : 'compact'} />
}
