import { Button } from '@astryxdesign/core/Button'
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
    <nav aria-label={`${sectionLabel(sectionId)} section`}>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-secondary">
        {sectionLabel(sectionId)}
      </p>
      <ul className="grid gap-1">
        {items.map((item) => {
          const current = isOperatorSectionPathActive(currentPath, item.href, sectionId)

          return (
            <li key={item.href}>
              <Button
                href={item.href}
                label={item.label}
                variant={current ? 'secondary' : 'ghost'}
                className="h-auto min-h-11 w-full justify-start px-3 py-2 text-left"
                aria-current={current ? 'page' : undefined}
              >
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.description === undefined ? null : (
                    <span className="text-xs font-normal text-secondary">{item.description}</span>
                  )}
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
