import { AeFactList } from '@/components/ae/data/AeFactList'
import type { ToolObjectView } from './object-family.contracts'

export type ToolFactsProps = Readonly<{ view: ToolObjectView; compact?: boolean }>

export function ToolFacts({ view, compact = false }: ToolFactsProps) {
  const { payment, authentication } = view.listing.facts
  return (
    <AeFactList className="min-w-0" density={compact ? 'compact' : 'default'} facts={[
      ...(view.price === undefined ? [] : [{ label: 'Price', value: <span className="font-mono tabular-nums">{view.price.label}</span> }]),
      { label: 'Readiness', value: view.readiness.label },
      ...(compact || payment.kind !== 'present' ? [] : [{ label: 'Payment', value: payment.value.lane === 'brokered' ? 'AE brokered' : 'External payment' }]),
      ...(compact || authentication.kind !== 'present' ? [] : [{ label: 'Authentication', value: authentication.value.replaceAll('_', ' ') }]),
    ]} />
  )
}
