import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { AeSiteEyebrow } from './AeSiteType'

type AeSiteCoverProps = {
  eyebrow: string
  title: string
  meta: string
  href: string
  className?: string
  children?: ReactNode
}

/**
 * Tall editorial cover — Opensource UI Magazine Cover composition without
 * stock photos, glass, or hover-zoom.
 */
export function AeSiteCover({
  eyebrow,
  title,
  meta,
  href,
  className,
  children,
}: AeSiteCoverProps) {
  return (
    <a
      href={href}
      data-ae-scheme="ink"
      className={cn(
        'relative grid min-h-80 w-full max-w-sm content-end gap-related bg-foreground p-page text-background no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <AeSiteEyebrow>{eyebrow}</AeSiteEyebrow>
      <span className="font-display text-3xl font-medium tracking-tight sm:text-4xl">{title}</span>
      <span className="font-mono text-xs">{meta}</span>
      {children}
    </a>
  )
}
