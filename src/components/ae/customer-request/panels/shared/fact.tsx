/**
 * A labelled fact on a decision surface.
 *
 * The label and value use separate block elements, so a bare wrapper cannot
 * collapse them into one string ("CostMaximum $14.00"). Every label/value pair
 * goes through this component to make that separation structural rather than
 * remembered.
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
    <p className="block text-sm text-muted-foreground">{label}</p>
    <div className="mt-1">{children}</div>
  </div>
}

/** The headline value of a fact — a price, a deadline, a count. */
export function FactValue({ tone = 'ordinary', children }: { tone?: FactTone; children: React.ReactNode }) {
  if (tone === 'material') return <p className="block text-lg font-semibold">{children}</p>
  if (tone === 'unresolved') return <p className="block text-muted-foreground">{children}</p>
  return <p className="block font-semibold">{children}</p>
}

/** A named block of supporting detail: a heading and its content, never run together. */
export function FactBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2">
    <p className="block font-semibold">{label}</p>
    {children}
  </div>
}
