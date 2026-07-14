import { BreadcrumbItem, Breadcrumbs } from '@astryxdesign/core/Breadcrumbs'
import type { OperatorBreadcrumbItem } from '@/lib/operator/navigation'

type AeOperatorBreadcrumbsProps = {
  items: readonly OperatorBreadcrumbItem[]
}

export function AeOperatorBreadcrumbs({ items }: AeOperatorBreadcrumbsProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <Breadcrumbs label="Breadcrumb">
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1 || item.href === undefined
        const itemKey = `${item.href ?? 'current'}:${item.label}`

        if (item.href === undefined) {
          return (
            <BreadcrumbItem key={itemKey} isCurrent={isCurrent}>
              {item.label}
            </BreadcrumbItem>
          )
        }

        return (
          <BreadcrumbItem key={itemKey} href={item.href} isCurrent={isCurrent}>
            {item.label}
          </BreadcrumbItem>
        )
      })}
    </Breadcrumbs>
  )
}
