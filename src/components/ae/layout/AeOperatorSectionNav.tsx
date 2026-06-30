import { Button } from '@/components/ui/button'
import {
  isOperatorSectionPathActive,
  sectionLabel,
  sectionNavForSection,
  type OperatorSectionId,
} from '@/lib/operator/navigation'

type AeOperatorSectionNavProps = {
  sectionId: OperatorSectionId
  currentPath: string
}

export function AeOperatorSectionNav({ sectionId, currentPath }: AeOperatorSectionNavProps) {
  const items = sectionNavForSection(sectionId)

  return (
    <nav aria-label={`${sectionLabel(sectionId)} section`} className="ae-operator-section-nav">
      <p className="mb-3 text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">
        {sectionLabel(sectionId)}
      </p>
      <ul className="grid gap-1">
        {items.map((item) => {
          const current = isOperatorSectionPathActive(currentPath, item.href, sectionId)

          return (
            <li key={item.href}>
              <Button
                asChild
                variant={current ? 'secondary' : 'ghost'}
                className="ae-operator-section-nav__link h-auto min-h-11 w-full justify-start px-3 py-2 text-left"
              >
                <a href={item.href} aria-current={current ? 'page' : undefined}>
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.description === undefined ? null : (
                      <span className="text-xs font-normal text-muted-foreground">{item.description}</span>
                    )}
                  </span>
                </a>
              </Button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
