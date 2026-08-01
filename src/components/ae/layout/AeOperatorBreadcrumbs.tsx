import { Fragment } from 'react'

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
    <Breadcrumb aria-label="Breadcrumb">
      <BreadcrumbList>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1 || item.href === undefined
          const itemKey = `${item.href ?? 'current'}:${item.label}`

          return (
            <Fragment key={itemKey}>
              {index === 0 ? null : <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isCurrent || item.href === undefined ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <a href={item.href}>{item.label}</a>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
