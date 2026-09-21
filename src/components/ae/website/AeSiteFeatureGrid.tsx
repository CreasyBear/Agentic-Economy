import { Card } from '@/components/ui/card'

export type AeSiteFeatureGridProps = Readonly<{
  label: string
  title: string
  items: readonly Readonly<{
    title: string
    description: string
  }>[]
}>

/** Port of aecon.ai's Dusk features-4 bordered two-column card grid. */
export function AeSiteFeatureGrid({ label, title, items }: AeSiteFeatureGridProps) {
  return (
    <section className="border-y bg-card/40 py-12 md:py-16" aria-labelledby="about-features">
      <div className="mx-auto max-w-7xl px-6">
        <span className="mb-3 block text-eyebrow font-medium tracking-eyebrow text-muted-foreground uppercase">
          {label}
        </span>
        <h2 id="about-features" className="max-w-3xl text-4xl font-extralight tracking-[-0.035em] md:text-5xl">
          {title}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.title} className="p-6 md:p-8">
              <h3 className="text-xl font-medium">{item.title}</h3>
              <p className="mt-3 max-w-lg text-muted-foreground">{item.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
