import { Fragment, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const BREADCRUMB_LINK_TACTILE =
  'active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type OperatorBreadcrumbItem = {
  label: string
  href?: string
}

type AeOperatorBreadcrumbsProps = {
  items: readonly OperatorBreadcrumbItem[]
}

const LABEL_CONTAINER_CLASS =
  'max-w-[12rem] sm:max-w-[16rem] truncate inline-block align-bottom'

function isIdLikeBreadcrumbLabel(label: string): boolean {
  if (label.includes('_') || label.includes('-')) {
    return true
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(label)) {
    return true
  }
  return /^[a-z][a-z0-9_]*[0-9a-f]{8,}$/i.test(label)
}

export function truncateBreadcrumbLabel(
  label: string,
  maxLength = 24,
): { isTruncated: boolean; display: string } {
  if (label.length <= maxLength) {
    return { isTruncated: false, display: label }
  }

  if (isIdLikeBreadcrumbLabel(label)) {
    const prefix = label.slice(0, 10)
    const suffix = label.slice(-6)
    return { isTruncated: true, display: `${prefix}...${suffix}` }
  }

  return {
    isTruncated: true,
    display: `${label.slice(0, maxLength - 1)}…`,
  }
}

type BreadcrumbLabelProps = {
  label: string
}

function BreadcrumbLabelText({ label }: BreadcrumbLabelProps) {
  const { isTruncated, display } = truncateBreadcrumbLabel(label)
  const text = <span className={LABEL_CONTAINER_CLASS}>{display}</span>

  if (!isTruncated) {
    return text
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex max-w-full cursor-default">{text}</span>
        }
      />
      <TooltipContent className="text-xs max-w-xs break-all">{label}</TooltipContent>
    </Tooltip>
  )
}

type RenderCrumbProps = {
  item: OperatorBreadcrumbItem
  index: number
  total: number
}

function renderBreadcrumbCrumb({ item, index, total }: RenderCrumbProps): ReactNode {
  const isCurrent = index === total - 1 || item.href === undefined

  if (isCurrent || item.href === undefined) {
    return (
      <BreadcrumbPage>
        <BreadcrumbLabelText label={item.label} />
      </BreadcrumbPage>
    )
  }

  return (
    <BreadcrumbLink
      className={BREADCRUMB_LINK_TACTILE}
      render={
        <Link to={item.href}>
          <BreadcrumbLabelText label={item.label} />
        </Link>
      }
    />
  )
}

type BreadcrumbSegment =
  | { kind: 'item'; item: OperatorBreadcrumbItem; index: number }
  | { kind: 'collapsed'; hidden: readonly OperatorBreadcrumbItem[] }

function breadcrumbSegments(items: readonly OperatorBreadcrumbItem[]): BreadcrumbSegment[] {
  if (items.length <= 3) {
    return items.map((item, index) => ({ kind: 'item', item, index }))
  }

  const firstItem = items[0]
  const lastItem = items[items.length - 1]
  if (!firstItem || !lastItem) {
    return items.map((item, index) => ({ kind: 'item', item, index }))
  }

  return [
    { kind: 'item', item: firstItem, index: 0 },
    { kind: 'collapsed', hidden: items.slice(1, -1) },
    { kind: 'item', item: lastItem, index: items.length - 1 },
  ]
}

export function AeOperatorBreadcrumbs({ items }: AeOperatorBreadcrumbsProps) {
  if (items.length === 0) {
    return null
  }

  const segments = breadcrumbSegments(items)

  return (
    <TooltipProvider>
      <Breadcrumb aria-label="Breadcrumb" className="min-w-0">
        <BreadcrumbList className="min-h-touch items-center">
          {segments.map((segment, segmentIndex) => {
            const segmentKey =
              segment.kind === 'item'
                ? `${segment.item.href ?? 'current'}:${segment.item.label}`
                : `collapsed:${segment.hidden.map((item) => item.label).join('/')}`

            return (
              <Fragment key={segmentKey}>
                {segmentIndex === 0 ? null : <BreadcrumbSeparator />}
                <BreadcrumbItem
                  {...(segment.kind === 'collapsed'
                    ? { 'data-slot': 'breadcrumb-collapsed-items' }
                    : {})}
                >
                  {segment.kind === 'collapsed' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            className={cn(
                              'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                              BREADCRUMB_LINK_TACTILE,
                            )}
                            aria-label="Show intermediate crumbs"
                          />
                        }
                      >
                        <BreadcrumbEllipsis className="size-8" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-44">
                        {segment.hidden.map((hiddenItem) =>
                          hiddenItem.href ? (
                            <DropdownMenuItem
                              key={`${hiddenItem.href}:${hiddenItem.label}`}
                              render={<Link to={hiddenItem.href} className="w-full" />}
                            >
                              {hiddenItem.label}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              key={`crumb:${hiddenItem.label}`}
                            >
                              {hiddenItem.label}
                            </DropdownMenuItem>
                          ),
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    renderBreadcrumbCrumb({
                      item: segment.item,
                      index: segment.index,
                      total: items.length,
                    })
                  )}
                </BreadcrumbItem>
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </TooltipProvider>
  )
}
