import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type AeCollectionRailProps = Readonly<{
  title: string
  titleId?: string
  deck?: string
  action?: ReactNode
  children?: ReactNode
  className?: string
}>

/** Discover collection header + object well. SoT rails stay in DirectoryHomeDiscovery. */
export function AeCollectionRail({
  title,
  titleId,
  deck,
  action,
  children,
  className,
}: AeCollectionRailProps) {
  return (
    <section className={cn('min-w-0', className)} {...(titleId === undefined ? {} : { 'aria-labelledby': titleId })}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id={titleId} className="text-title font-medium tracking-tight sm:text-title-lg">
            {title}
          </h2>
          {deck === undefined ? null : (
            <p className="mt-2 text-deck leading-relaxed text-muted-foreground">{deck}</p>
          )}
        </div>
        {action === undefined ? null : <div className="flex min-w-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  )
}
