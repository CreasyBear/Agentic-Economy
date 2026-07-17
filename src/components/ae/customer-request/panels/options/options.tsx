import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
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
  return <section className="grid gap-6" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><div className="grid gap-2"><Text className="text-sm font-semibold text-accent">{recommendation ? 'A clear price leader' : isSingle ? 'One option found' : 'Options found'}</Text><Heading level={2} className="text-3xl">{recommendation && recommendedBusiness ? `AE recommends ${recommendedBusiness}.` : isSingle ? 'One registered option matched.' : `${projection.options.length} registered options found.`}</Heading><Text color="secondary">{recommendation ? 'This recommendation follows the price priority in your request.' : isSingle ? 'This is not a comparison or recommendation.' : 'These options are not ranked. AE has not recommended one.'} Nothing has been selected, booked, or purchased.</Text>{recommendation ? <RecommendationEvidence ordering={recommendation} /> : null}{coverage ? <Text type="supporting" color="secondary">AE evaluated {coverage.evaluated} connected {coverage.evaluated === 1 ? 'business' : 'businesses'}: {coverage.optionsReceived} returned an option, {coverage.unavailable} unavailable, {coverage.pending} pending, {coverage.uncertain} uncertain.</Text> : null}</div><div className="grid gap-4 md:grid-cols-2">{projection.options.map((candidate) => <Card key={candidate.optionRef} padding={5}><article className="grid gap-3"><div><Text type="supporting" color="secondary">{recommendation?.optionRef === candidate.optionRef ? 'Recommended for your price priority' : 'Provider-reported option'}</Text><Heading level={3}>{candidate.business.name}</Heading></div><div><Text type="supporting" color="secondary">Provider estimate</Text><Text type="large" weight="semibold">{formatMoney(candidate.expectedCost.currency, candidate.expectedCost.amountMinor)}</Text><Text type="supporting" color="secondary">Provider maximum {formatMoney(candidate.maximumCost.currency, candidate.maximumCost.amountMinor)}</Text></div><PriceBasis option={candidate} />{candidate.comparableOutputs.map((output) => <Text key={output.label} color="secondary"><strong>{output.label}:</strong> {String(output.value)}</Text>)}{candidate.materialTerms.map((term) => <Text key={term} color="secondary">Provider term: {term}</Text>)}<Text type="supporting" color="secondary">Provider cancellation: {candidate.cancellation.summary}</Text><CommercialRelationship option={candidate} /><Text type="supporting" color="secondary">Valid until {formatOptionTime(candidate.provenance?.validUntil ?? candidate.expiresAt)}</Text></article></Card>)}</div><RecoveryActions edit={edit} restart={restart} /></section>
}
function PriceBasis({ option }: { option: CustomerRequestView['options'][number] }) {
  const componentTotal = option.priceComponents.reduce((total, component) => total + component.amountMinor, 0)
  const unitemizedMaximum = option.maximumCost.amountMinor - componentTotal
  return <div className="grid gap-1"><Text type="supporting" weight="semibold">Reported price components</Text>{option.priceComponents.map((component) => <Text key={`${component.label}:${component.amountMinor}`} type="supporting" color="secondary">{component.label}: {formatMoney(option.maximumCost.currency, component.amountMinor)}</Text>)}{unitemizedMaximum > 0 ? <Text type="supporting" color="secondary">The provider maximum includes up to {formatMoney(option.maximumCost.currency, unitemizedMaximum)} not itemised above.</Text> : null}</div>
}
function RecommendationEvidence({ ordering }: { ordering: Extract<NonNullable<CustomerRequestView['optionSet']>['ordering'], { kind: 'recommended' }> }) {
  return <div className="grid gap-2 rounded-md border border-border bg-surface p-4"><Text weight="semibold">Why this option</Text><ul className="grid gap-1 text-sm text-secondary">{ordering.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><Text type="supporting" weight="semibold">Tradeoffs checked</Text><ul className="grid gap-1 text-sm text-secondary">{ordering.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul></div>
}
function CommercialRelationship({ option }: { option: CustomerRequestView['options'][number] }) {
  const influence = option.commercialInfluence
  if (influence.status === 'unknown') return <Text type="supporting" color="secondary">Commercial relationship: AE has no registered evidence for this option.</Text>
  if (influence.status === 'none') return <Text type="supporting" color="secondary">Commercial relationship: {influence.summary}</Text>
  const effects = [
    influence.influencesEligibility ? 'eligibility' : undefined,
    influence.influencesInclusion ? 'inclusion' : undefined,
    influence.influencesOrder ? 'ordering' : undefined,
  ].filter((effect): effect is string => effect !== undefined)
  return <div className="grid gap-1 rounded-md border border-border bg-surface p-3"><Text type="supporting" weight="semibold">Commercial relationship disclosed</Text><Text type="supporting" color="secondary">{influence.summary}</Text><Text type="supporting" color="secondary">{influence.payerName} pays {influence.beneficiaryName}: {influence.compensationBasis}.</Text><Text type="supporting" color="secondary">{effects.length === 0 ? 'Registered as not influencing eligibility, inclusion, or ordering.' : `Registered as influencing ${effects.join(', ')}.`}</Text></div>
}
export function NoOptions({ projection, turns, edit, restart }: { projection: CustomerRequestView; turns: readonly ConversationTurn[]; edit: () => void; restart: () => void }) { return <section className="mx-auto grid w-full max-w-4xl gap-5" aria-live="polite"><Conversation turns={turns} /><WorkingUnderstanding projection={projection} correct={edit} /><Card padding={5}><div className="grid gap-4"><Text className="text-sm font-semibold text-accent">No matching options right now</Text><Heading level={2}>Nothing available matched your request.</Heading><Text color="secondary">Your Request is preserved. You can change what matters, try again later, or stop; AE will not invent availability.</Text><Text type="supporting" color="secondary">Request revision {projection.revision}</Text><RecoveryActions edit={edit} restart={restart} /></div></Card></section> }
