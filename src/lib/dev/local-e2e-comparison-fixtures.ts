import type { OfferingComparisonEnvelope } from '@/modules/catalog/public'

type LocalComparisonFixture = Readonly<{
  kind: 'resolved'
  business: Readonly<{ businessId: string; slug: string; name: string }>
  offering: Readonly<{
    offeringRef: string
    revision: number
    name: string
    category: string
    summary: string
    comparison: OfferingComparisonEnvelope
  }>
  publication: Readonly<{
    publishedAt: number
    safeDisplayDisposition: 'retain_safe_history'
  }>
  projectionDisposition: 'current' | 'partial' | 'stale'
  currentReference?: Readonly<{
    businessId: string
    offeringRef: string
    offeringRevision: number
  }>
}>

const observedAt = Date.UTC(2026, 6, 1)
const source = { kind: 'business_supplied' as const }

export const LOCAL_E2E_COMPARISON_FIXTURES = [
  professionalServiceFixture({
    businessId: 'legacy-business:plumbing-demo',
    slug: 'plumbing-demo',
    businessName: 'Demo Plumbing',
    offeringRef: 'legacy-offering:plumbing-demo:diagnostic-plumbing',
    revision: 1,
    offeringName: 'Diagnostic plumbing',
    category: 'Plumbing',
    summary: 'Diagnostic plumbing triage for first contact.',
    scope: 'Diagnostic plumbing triage',
    priceDescription: 'AUD 180 published call-out',
    amountMinor: 18_000,
    timing: 'Published response window: same business day',
    serviceArea: 'Parramatta',
    currentReference: {
      businessId: 'legacy-business:plumbing-demo',
      offeringRef: 'legacy-offering:plumbing-demo:diagnostic-plumbing',
      offeringRevision: 2,
    },
  }),
  professionalServiceFixture({
    businessId: 'legacy-business:plumbing-demo',
    slug: 'plumbing-demo',
    businessName: 'Demo Plumbing',
    offeringRef: 'legacy-offering:plumbing-demo:diagnostic-plumbing',
    revision: 2,
    offeringName: 'Diagnostic plumbing',
    category: 'Plumbing',
    summary: 'Updated diagnostic plumbing triage.',
    scope: 'Diagnostic plumbing triage and written findings',
    priceDescription: 'AUD 220 published call-out',
    amountMinor: 22_000,
    timing: 'Published response window: same business day',
    serviceArea: 'Parramatta',
  }),
  professionalServiceFixture({
    businessId: 'legacy-business:fremantle-coastal-electrical',
    slug: 'fremantle-coastal-electrical',
    businessName: 'Fremantle Coastal Electrical',
    offeringRef: 'legacy-offering:fremantle-coastal-electrical:electrical-fault-repairs',
    revision: 1,
    offeringName: 'Electrical fault repairs',
    category: 'Electrical repairs',
    summary: 'Electrical fault checks and repair coordination for homes and small businesses.',
    scope: 'Electrical fault check and repair coordination',
    priceDescription: 'AUD 240 published inspection',
    amountMinor: 24_000,
    timing: 'Published response window: two business days',
    serviceArea: 'Fremantle and nearby suburbs',
  }),
  professionalServiceFixture({
    businessId: 'legacy-business:joondalup-rapid-plumbing',
    slug: 'joondalup-rapid-plumbing',
    businessName: 'Joondalup Rapid Plumbing',
    offeringRef: 'legacy-offering:joondalup-rapid-plumbing:emergency-plumbing',
    revision: 1,
    offeringName: 'Emergency plumbing',
    category: 'Plumbing',
    summary: 'Burst pipe and blocked drain triage for urgent local plumbing issues.',
    scope: 'Emergency plumbing triage',
    priceDescription: 'Price not supplied',
    timing: 'Published response window: urgent calls prioritised',
    serviceArea: 'Joondalup and nearby suburbs',
  }),
] as const satisfies readonly LocalComparisonFixture[]

function professionalServiceFixture(input: Readonly<{
  businessId: string
  slug: string
  businessName: string
  offeringRef: string
  revision: number
  offeringName: string
  category: string
  summary: string
  scope: string
  priceDescription: string
  amountMinor?: number
  timing: string
  serviceArea: string
  currentReference?: LocalComparisonFixture['currentReference']
}>): LocalComparisonFixture {
  return {
    kind: 'resolved',
    business: {
      businessId: input.businessId,
      slug: input.slug,
      name: input.businessName,
    },
    offering: {
      offeringRef: input.offeringRef,
      revision: input.revision,
      name: input.offeringName,
      category: input.category,
      summary: input.summary,
      comparison: {
        schemaVersion: 'offering-comparison:v1',
        profile: {
          profileId: 'professional_service:v1',
          scopeBasis: known(input.scope),
          priceBasis: input.amountMinor === undefined
            ? { kind: 'not_supplied', source, observedAt }
            : known({
                description: input.priceDescription,
                currency: 'AUD',
                amountMinor: input.amountMinor,
                unit: 'total' as const,
              }),
          timingBasis: known(input.timing),
          serviceArea: known(input.serviceArea),
        },
      },
    },
    publication: {
      publishedAt: observedAt,
      safeDisplayDisposition: 'retain_safe_history',
    },
    projectionDisposition: 'current',
    ...(input.currentReference === undefined
      ? {}
      : { currentReference: input.currentReference }),
  }
}

function known<const Value>(value: Value) {
  return { kind: 'known' as const, value, source, observedAt }
}
