import type { PrivacyDetailCardsProps } from '../privacy.contracts'

export function PrivacyDetailCards({ cards }: PrivacyDetailCardsProps) {
  return (
    <section className="grid gap-related">
      {cards.map(({ icon: CardIcon, label, title, body }) => (
        <div key={title} className="grid gap-intra">
          <p className="flex items-center gap-intra font-semibold text-foreground">
            <CardIcon className="size-4 text-foreground" aria-hidden="true" /> {title}
            <span className="text-muted-foreground">{label}</span>
          </p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      ))}
    </section>
  )
}
