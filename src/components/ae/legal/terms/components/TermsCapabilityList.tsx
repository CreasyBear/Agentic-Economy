import type { TermsCapabilityListProps } from '../terms.contracts'

export function TermsCapabilityList({ items }: TermsCapabilityListProps) {
  return (
    <section className="grid gap-related">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="grid gap-intra">
          <p className="flex items-center gap-intra font-semibold text-foreground">
            <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
          </p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      ))}
    </section>
  )
}
