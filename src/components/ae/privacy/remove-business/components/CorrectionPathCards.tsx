import { Badge } from '@/components/ui/badge'

import type { CorrectionPathCardsProps } from '../remove-business.contracts'

export function CorrectionPathCards({ paths }: CorrectionPathCardsProps) {
  return (
    <section className="divide-y divide-border border-y border-border">
      {paths.map(({ icon: Icon, label, title, body }) => (
        <div key={title} className="grid gap-intra py-related first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-related">
            <p className="flex items-center gap-intra text-lg font-medium text-foreground">
              <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
            </p>
            <Badge variant="secondary">{label}</Badge>
          </div>
          <p className="block text-muted-foreground">{body}</p>
        </div>
      ))}
    </section>
  )
}
