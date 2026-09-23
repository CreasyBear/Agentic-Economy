import { Card } from '@/components/ui/card'

import { AeSiteSection } from './AeSiteSection'
import { AeSiteEyebrow, AeSiteHeading } from './AeSiteType'

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
    <AeSiteSection
      labelledBy="about-features"
      rhythm="section"
      className="border-y bg-card/40"
    >
      <div className="mx-auto max-w-7xl px-6">
        <AeSiteEyebrow>{label}</AeSiteEyebrow>
        <AeSiteHeading as="h2" size="md" id="about-features" className="max-w-3xl">
          {title}
        </AeSiteHeading>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.title} className="p-6 md:p-8">
              <AeSiteHeading as="h3" size="sm">{item.title}</AeSiteHeading>
              <p className="mt-3 max-w-lg text-muted-foreground">{item.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </AeSiteSection>
  )
}
