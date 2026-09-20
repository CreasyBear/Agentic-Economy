import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

import type { CorrectionPathCardsProps } from '../remove-business.contracts'

export function CorrectionPathCards({ paths }: CorrectionPathCardsProps) {
  return (
    <section className="grid gap-related">
      {paths.map(({ icon: Icon, label, title, body }) => (
        <Card key={title} className="grid gap-intra p-gutter shadow-none">
          <div className="flex items-center justify-between gap-related">
            <p className="flex items-center gap-intra text-lg font-semibold text-foreground">
              <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
            </p>
            <Badge variant="secondary">{label}</Badge>
          </div>
          <p className="block text-muted-foreground">{body}</p>
        </Card>
      ))}
    </section>
  )
}
