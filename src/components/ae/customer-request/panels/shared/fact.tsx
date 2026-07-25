import { Text } from '@astryxdesign/core/Text'

/**
 * A labelled fact on a decision surface.
 *
 * Astryx `Text` renders an inline `<span>`, so a label and its value stacked in
 * a bare wrapper run together as one string ("CostMaximum $14.00"). Every
 * label/value pair goes through this component so the separation is structural
 * rather than remembered.
 *
 * `tone` carries the only signal hierarchy this surface needs. A person
 * deciding whether to authorize work reads cost and irreversibility first, so
 * those facts get scale and weight. Eucalyptus stays reserved for action and
 * progress, and tone never carries meaning on its own — the words already say
 * it. Weight only makes the reading order match the stakes.
 */

export type FactTone = 'ordinary' | 'material' | 'unresolved'

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div>
    <Text type="supporting" color="secondary" className="block">{label}</Text>
    <div className="mt-1">{children}</div>
  </div>
}

/** The headline value of a fact — a price, a deadline, a count. */
export function FactValue({ tone = 'ordinary', children }: { tone?: FactTone; children: React.ReactNode }) {
  if (tone === 'material') return <Text type="large" weight="semibold" className="block">{children}</Text>
  if (tone === 'unresolved') return <Text color="secondary" className="block">{children}</Text>
  return <Text weight="semibold" className="block">{children}</Text>
}

/** A named block of supporting detail: a heading and its content, never run together. */
export function FactBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2">
    <Text weight="semibold" className="block">{label}</Text>
    {children}
  </div>
}
