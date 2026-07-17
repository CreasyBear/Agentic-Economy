import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { formatMoney } from './format'

export function WorkingUnderstanding({ projection, correct }: { projection: CustomerRequestView; correct: () => void }) { const criteria = projection.criteria ?? []; if (criteria.length === 0) return null; return <Card padding={4}><div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><Text className="text-sm font-semibold text-accent">AE’s working understanding</Text></div><button type="button" onClick={correct} className="min-h-11 text-sm font-semibold underline underline-offset-4">Correct</button></div><div className="grid gap-2">{criteria.map((criterion) => <div key={`${criterion.label}:${workingCriterionValue(criterion.value)}`} className="rounded-md border border-border bg-surface px-3 py-2 text-sm"><div><strong>{workingCriterionLabel(criterion.label, criterion.value, projection.summary)}:</strong> {workingCriterionValue(criterion.value)}</div><Text type="supporting" color="secondary">{criterion.basis === 'customer_provided' ? 'You said this.' : 'Understood from your request.'} {workingCriterionImpact(criterion.impact)}</Text></div>)}</div></div></Card> }
function workingCriterionImpact(impact: NonNullable<CustomerRequestView['criteria']>[number]['impact']): string {
  if (impact === 'uncertainty') return 'AE will keep this uncertainty visible until evidence resolves it.'
  if (impact === 'authority_boundary') return 'This Request does not grant permission to cross this boundary.'
  return 'Used to decide which options fit and how they compare.'
}
function workingCriterionValue(value: unknown): string {
  if (value === null) return 'Not specified'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(workingCriterionValue).join(', ')
  const entries = Object.entries(value)
  const currency = entries.find(([key]) => key === 'currency')?.[1]
  const amountMinor = entries.find(([key]) => key === 'amountMinor')?.[1]
  if (typeof currency === 'string' && typeof amountMinor === 'number') return formatMoney(currency, amountMinor)
  return entries.map(([key, entry]) => `${key.replaceAll('_', ' ')}: ${workingCriterionValue(entry)}`).join(', ')
}
function workingCriterionLabel(label: string, value: unknown, requestSummary: string): string {
  if (!label.trim().endsWith('?')) return label
  return value === requestSummary ? 'Request' : 'Request detail'
}
