import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { ToolObjectView } from '@/components/ae/shared/object-family.contracts'
import { toolCardState, toolChoiceReadinessLabel, type ToolCardProjection, type ToolCardRecommendation } from '@/modules/chat/tool-card'
import { projectChatChoiceActions } from '@/modules/chat/tool-card-actions'
import { isDetailToolRef } from '@/modules/chat/run-request'
import type {
  ComparisonCellView, ComparisonRowView, ComparisonTableView, OptionView,
  OptionsGridView, SourcesInlineView, WorkDisclosureView,
} from './generative.contracts'

const sourceLabel = (provenance: string) => provenance === 'ae_observed' ? 'AE-observed' : provenance === 'directory_reported' ? 'Directory-reported' : provenance === 'business_published' ? 'Business-published' : 'Provider-reported'
const projectChoiceReadiness = (readiness: string | undefined): OptionView['readiness'] =>
  readiness === 'ready' || readiness === 'unavailable' ? readiness : 'unverified'

/** A search card identifies the shortlist; a joined registry view supplies richer, attributed facts. */
export function projectOptionsFromCard(
  card: ToolCardProjection,
  listings: readonly ToolObjectView[] = [],
  nowMs = Date.now(),
  recommendation?: ToolCardRecommendation,
): OptionsGridView {
  if (card.kind !== 'choices') return { options: [], comparedIds: [] }
  const options = projectChatChoiceActions([card]).map(({ choice, reviewInputs }): OptionView => {
    const object = listings.find(({ listing }) => listing.canonicalToolRef.kind === 'present' && listing.canonicalToolRef.value === choice.toolRef)
    const listing = object?.listing
    const readiness = listing?.facts.readiness
    const ready = readiness?.kind === 'present' && readiness.value.posture === 'routeable' && (readiness.value.validUntil === undefined || readiness.value.validUntil > nowMs)
    const unavailable = readiness?.kind === 'present' && readiness.value.posture === 'unavailable' && (readiness.value.validUntil === undefined || readiness.value.validUntil > nowMs)
    const price = listing?.facts.price
    const usage = listing?.facts.completedCalls
    const facts: Record<string, ComparisonCellView> = {}
    const outcome = object?.outcome ?? choice.summary
    if (outcome !== undefined) facts['What it does'] = { value: outcome, source: 'Provider description' }
    const currentPrice = price?.kind === 'present' && (price.validUntil === undefined || price.validUntil > nowMs)
    const displayedPrice = currentPrice ? object?.price?.label ?? choice.price : choice.price
    if (currentPrice && displayedPrice !== undefined) facts.Price = { value: displayedPrice, source: sourceLabel(price.provenance) }
    else if (choice.price !== undefined && (choice.priceValidUntil === undefined || choice.priceValidUntil > nowMs)) {
      facts.Price = { value: choice.price, source: 'Indicative catalogue price' }
    }
    if (readiness?.kind === 'present' && (readiness.value.validUntil === undefined || readiness.value.validUntil > nowMs)) {
      facts.Readiness = { value: ready ? 'Ready to use' : unavailable ? getStatusPresentation('unavailable').label : getStatusPresentation('setup_required').label, source: sourceLabel(readiness.provenance) }
    } else if (choice.readiness !== undefined) {
      facts.Readiness = { value: toolChoiceReadinessLabel(choice.readiness), source: 'Catalogue result' }
    }
    if (usage?.kind === 'present') facts.Usage = { value: `${usage.value.count.toLocaleString()} uses ${usage.value.window}`, source: sourceLabel(usage.provenance) }
    const identity = object?.identity
    const seller = identity?.kind === 'verified_provider' ? { kind: 'provider' as const, name: identity.name }
      : identity?.kind === 'directory_host' ? { kind: 'host' as const, name: identity.name } : undefined
    return {
      id: choice.toolRef,
      name: object?.title ?? choice.title,
      href: choice.detailHref ?? object?.href ?? `/tools/${encodeURIComponent(choice.toolRef)}`,
      ...(outcome === undefined ? {} : { outcome }),
      price: displayedPrice ?? 'Price to be confirmed',
      ...(displayedPrice === undefined || (currentPrice ? price?.validUntil : choice.priceValidUntil) === undefined
        ? {} : { priceValidUntil: currentPrice ? price?.validUntil : choice.priceValidUntil }),
      ...(usage?.kind === 'present' ? { usage: `Used ${usage.value.count.toLocaleString()}× ${usage.value.window}` } : {}),
      ...(choice.sourcePrice === undefined ? {} : { providerListedPrice: choice.sourcePrice }),
      ...(choice.host === undefined ? {} : { host: choice.host }),
      ...(choice.resourcePath === undefined ? {} : { resourcePath: choice.resourcePath }),
      ...(choice.networkLabel === undefined ? {} : { networkLabel: choice.networkLabel }),
      readiness: projectChoiceReadiness(choice.readiness),
      ...(seller === undefined ? {} : { seller }),
      selectable: !choice.belowMatch
        && (listing === undefined || listing.canonicalToolRef.kind === 'present'),
      detailRequestable: isDetailToolRef(choice.toolRef),
      ...(reviewInputs ? { reviewInputs: true } : {}),
      ...(Object.keys(facts).length === 0 ? {} : { facts }),
    }
  })
  const recommendedOption = recommendation === undefined
    ? undefined
    : options.find((option) => option.id === recommendation.toolRef && option.reviewInputs === true)
  return {
    comparedIds: [],
    ...(recommendedOption === undefined || recommendation === undefined ? {} : {
      recommendedId: recommendedOption.id,
      recommendedBy: recommendation.by,
    }),
    options,
  }
}

/** Compare aligned sourced dimensions; absent claims stay absent. No guessed recommendation. */
export function projectComparison(options: readonly OptionView[]): ComparisonTableView {
  const selected = options.slice(0, 4)
  const rows: ComparisonRowView[] = ['What it does', 'Price', 'Readiness', 'Usage'].filter((label) => selected.some((option) => option.facts?.[label] !== undefined)).map((label) => ({
    label,
    cells: Object.fromEntries(selected.flatMap((option) => option.facts?.[label] === undefined ? [] : [[option.id, option.facts[label]]])),
  }))
  return { options: selected, rows }
}

export function projectSourcesFromCards(cards: readonly ToolCardProjection[]): SourcesInlineView {
  const sources = new Map<string, SourcesInlineView['sources'][number]>()
  for (const card of cards) {
    if (card.kind !== 'choices' && card.kind !== 'inspect') continue
    if (card.kind === 'choices') {
      for (const choice of card.choices) if (!choice.belowMatch && !sources.has(choice.toolRef)) sources.set(choice.toolRef, {
        toolRef: choice.toolRef, title: choice.title,
        href: choice.detailHref ?? `/tools/${encodeURIComponent(choice.toolRef)}`,
      })
    }
  }
  return { sources: [...sources.values()] }
}

export function projectWorkFromCards(cards: readonly ToolCardProjection[]): WorkDisclosureView {
  const searched = cards.filter((card) => card.kind === 'choices' && (card.toolId === 'registry.tools.search' || card.toolId === 'registry.tools.list'))
  const compared = cards.filter((card) => card.kind === 'choices' && card.toolId === 'registry.tools.compare')
  const latestComparison = compared.at(-1)
  const found = new Set(searched.flatMap((card) => card.kind === 'choices' ? card.choices
    .filter((choice) => !choice.belowMatch).map((choice) => choice.toolRef) : []))
  const summary = [
    found.size > 0 ? `Found ${found.size} tool${found.size === 1 ? '' : 's'}` : '',
    searched.length > 0 && found.size === 0 ? 'Search found no matching Tools' : '',
    latestComparison?.kind === 'choices' ? `Compared ${latestComparison.choices.length}` : '',
  ].filter(Boolean).join(' · ') || `${cards.length} step${cards.length === 1 ? '' : 's'}`
  return {
    summary,
    steps: cards.map((card, index) => ({
      id: `${index}:${card.toolId}`,
      label: card.title,
      status: toolCardState(card) === 'working' ? 'working' as const : toolCardState(card) === 'complete' ? 'complete' as const : 'attention' as const,
    })),
  }
}
