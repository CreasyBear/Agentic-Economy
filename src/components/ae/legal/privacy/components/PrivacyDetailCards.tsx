import type { PrivacyDetailCardsProps } from '../privacy.contracts'

export function PrivacyDetailCards({ cards }: PrivacyDetailCardsProps) {
  return (
    <section className="grid gap-related">
      {cards.map(({ icon: CardIcon, label, title, body }) => (
        <div key={title} className="grid gap-intra">
          <p className="text-caption font-medium uppercase tracking-caption text-muted-foreground">{label}</p>
          <p className="flex items-center gap-intra font-medium text-foreground">
            <CardIcon className="size-4 text-foreground" aria-hidden="true" />
            <span>{title}</span>
          </p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      ))}
    </section>
  )
}
