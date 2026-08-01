import { Card } from '@/components/ui/card'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import type { ConversationTurn } from '../../workspace-types'
import {
  Conversation,
  WorkingUnderstanding,
  RecoveryActions,
  formatMoney,
  formatOptionTime,
} from '../shared'

export function OptionsCard({ projection, turns, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; edit: () => void; restart: () => void }) {
  const optionSet = projection.optionSet
  const isSingle = optionSet?.cardinality === 'single' || projection.options.length === 1
  const coverage = optionSet?.coverage
  const recommendation = optionSet?.ordering.kind === 'recommended' ? optionSet.ordering : undefined
  const recommendedBusiness = recommendation === undefined ? undefined
    : projection.options.find((option) => option.optionRef === recommendation.optionRef)?.business.name
  return <section className="grid gap-6" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><div className="grid gap-2"><p className="text-sm font-semibold text-brand">{recommendation ? 'Recommended match' : isSingle ? 'One option' : 'Options to compare'}</p><h2 className="text-3xl font-semibold">{recommendation && recommendedBusiness ? `AE recommends ${recommendedBusiness}.` : isSingle ? 'One business option matches.' : `${projection.options.length} business options match.`}</h2><p className="text-muted-foreground">{recommendation ? 'This recommendation follows the price priority in your request.' : isSingle ? 'Review this option and choose what to do next.' : 'Compare these options and choose your next step.'}</p>{recommendation ? <RecommendationEvidence ordering={recommendation} /> : null}{coverage ? <p className="text-sm text-muted-foreground">AE checked {coverage.evaluated} {coverage.evaluated === 1 ? 'business' : 'businesses'}: {coverage.optionsReceived} returned an option, {coverage.unavailable} unavailable, {coverage.pending} pending, {coverage.uncertain} uncertain.</p> : null}</div><div className="grid gap-4 md:grid-cols-2">{projection.options.map((candidate) => <Card key={candidate.optionRef} className="p-5"><article className="grid gap-3"><div><p className="text-sm text-muted-foreground">{recommendation?.optionRef === candidate.optionRef ? 'Recommended for your price priority' : 'Published business option'}</p><h3 className="text-xl font-semibold">{candidate.business.name}</h3></div><div><p className="text-sm text-muted-foreground">Published estimate</p><p className="text-lg font-semibold">{formatMoney(candidate.expectedCost.currency, candidate.expectedCost.amountMinor)}</p><p className="text-sm text-muted-foreground">Published maximum {formatMoney(candidate.maximumCost.currency, candidate.maximumCost.amountMinor)}</p></div><PriceBasis option={candidate} />{candidate.comparableOutputs.map((output) => <p key={output.label} className="text-muted-foreground"><strong>{output.label}:</strong> {String(output.value)}</p>)}{candidate.materialTerms.map((term) => <p key={term} className="text-muted-foreground">Published term: {term}</p>)}<p className="text-sm text-muted-foreground">Published cancellation: {candidate.cancellation.summary}</p><CommercialRelationship option={candidate} /><p className="text-sm text-muted-foreground">Valid until {formatOptionTime(candidate.provenance?.validUntil ?? candidate.expiresAt)}</p></article></Card>)}</div><RecoveryActions edit={edit} restart={restart} /></section>
}
function PriceBasis({ option }: { option: CustomerRequestView['options'][number] }) {
  const componentTotal = option.priceComponents.reduce((total, component) => total + component.amountMinor, 0)
  const unitemizedMaximum = option.maximumCost.amountMinor - componentTotal
  return <div className="grid gap-1"><p className="text-sm font-semibold">Reported price components</p>{option.priceComponents.map((component) => <p key={`${component.label}:${component.amountMinor}`} className="text-sm text-muted-foreground">{component.label}: {formatMoney(option.maximumCost.currency, component.amountMinor)}</p>)}{unitemizedMaximum > 0 ? <p className="text-sm text-muted-foreground">The provider maximum includes up to {formatMoney(option.maximumCost.currency, unitemizedMaximum)} not itemised above.</p> : null}</div>
}
function RecommendationEvidence({ ordering }: { ordering: Extract<NonNullable<CustomerRequestView['optionSet']>['ordering'], { kind: 'recommended' }> }) {
  return <div className="grid gap-2 rounded-md border border-border bg-card p-4"><p className="font-semibold">Why this option</p><ul className="grid gap-1 text-sm text-muted-foreground">{ordering.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="text-sm font-semibold">Tradeoffs checked</p><ul className="grid gap-1 text-sm text-muted-foreground">{ordering.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul></div>
}
function CommercialRelationship({ option }: { option: CustomerRequestView['options'][number] }) {
  const influence = option.commercialInfluence
  if (influence.status === 'unknown') return <p className="text-sm text-muted-foreground">Commercial relationship: AE has no registered evidence for this option.</p>
  if (influence.status === 'none') return <p className="text-sm text-muted-foreground">Commercial relationship: {influence.summary}</p>
  const effects = [
    influence.influencesEligibility ? 'eligibility' : undefined,
    influence.influencesInclusion ? 'inclusion' : undefined,
    influence.influencesOrder ? 'ordering' : undefined,
  ].filter((effect): effect is string => effect !== undefined)
  return <div className="grid gap-1 rounded-md border border-border bg-card p-3"><p className="text-sm font-semibold">Commercial relationship disclosed</p><p className="text-sm text-muted-foreground">{influence.summary}</p><p className="text-sm text-muted-foreground">{influence.payerName} pays {influence.beneficiaryName}: {influence.compensationBasis}.</p><p className="text-sm text-muted-foreground">{effects.length === 0 ? 'Registered as not influencing eligibility, inclusion, or ordering.' : `Registered as influencing ${effects.join(', ')}.`}</p></div>
}
export function NoOptions({ projection: _projection, turns, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; edit: () => void; restart: () => void }) { return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={_projection} correct={edit} /><Card className="p-5"><div className="grid gap-4"><p className="text-sm font-semibold text-brand">No current option matches</p><h2 className="text-2xl font-semibold">Nothing published fits this request right now.</h2><p className="text-muted-foreground">Your request is saved. Change what matters or try again when a business publishes something suitable.</p><RecoveryActions edit={edit} restart={restart} /></div></Card></section> }
