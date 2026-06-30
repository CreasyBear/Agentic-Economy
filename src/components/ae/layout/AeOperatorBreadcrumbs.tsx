import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { OperatorBreadcrumbItem } from '@/lib/operator/navigation'

type AeOperatorBreadcrumbsProps = {
  items: readonly OperatorBreadcrumbItem[]
}

export function AeOperatorBreadcrumbs({ items }: AeOperatorBreadcrumbsProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <Breadcrumb className="ae-operator-breadcrumbs">
      <BreadcrumbList>
        {items.flatMap((item, index) => {
          const isLast = index === items.length - 1
          const entry = (
            <BreadcrumbItem key={`${item.label}-${index}`}>
              {isLast || item.href === undefined ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          )

          if (isLast) {
            return [entry]
          }

          return [entry, <BreadcrumbSeparator key={`sep-${index}`} />]
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
