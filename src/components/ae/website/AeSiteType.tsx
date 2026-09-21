import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { AeMarkedDivider } from './AeSiteMarks'
export type AeSiteHeadingLevel = 'h1' | 'h2' | 'h3'
export type AeSiteHeadingSize = 'xl' | 'lg' | 'md' | 'sm' | 'xs'

type AeSiteHeadingProps = {
  as?: AeSiteHeadingLevel
  size?: AeSiteHeadingSize
  children: string
  id?: string
  className?: string
}

/** Discover display recipes. ExtraLight; no viewport-fluid weight jumps. */
const sizeClass: Record<AeSiteHeadingSize, string> = {
  xl: 'font-display max-w-xl text-display leading-[1.02] font-extralight tracking-display lg:text-6xl xl:text-7xl',
  lg: 'font-display max-w-xl text-5xl leading-[1.02] font-extralight tracking-display lg:text-6xl',
  md: 'font-display max-w-xl text-4xl leading-[1.06] font-extralight tracking-display lg:text-5xl',
  sm: 'font-sans text-title font-medium tracking-tight sm:text-title-lg',
  xs: 'font-sans text-lg font-medium leading-snug tracking-tight sm:text-xl',
}

export function AeSiteHeading({
  as: Tag = 'h2',
  size = 'md',
  children,
  id,
  className,
}: AeSiteHeadingProps) {
  return (
    <Tag id={id} className={cn('text-balance', sizeClass[size], className)}>
      {children}
    </Tag>
  )
}

type AeSiteBodyProps = {
  children: ReactNode
  muted?: boolean
  size?: 'md' | 'sm'
  id?: string
  className?: string
}

export function AeSiteBody({ children, muted = false, size = 'md', id, className }: AeSiteBodyProps) {
  return (
    <p
      {...(id === undefined ? {} : { id })}
      data-ae-muted={muted ? '' : undefined}
      className={cn(
        'ae-site-body max-w-[65ch] text-pretty',
        size === 'md' ? 'text-deck leading-relaxed lg:text-body' : 'text-deck leading-relaxed',
        muted ? 'text-muted-foreground' : 'text-foreground',
        className,
      )}
    >
      {children}
    </p>
  )
}

export function AeSiteEyebrow({ children }: { children: string }) {
  return (
    <p className="ae-site-eyebrow font-sans text-eyebrow font-medium tracking-eyebrow text-muted-foreground uppercase">
      {children}
    </p>
  )
}

export function AeSiteHeadingPair({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid [&>*+*]:mt-3', className)}>{children}</div>
}

export function AeSiteIntro({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid [&>*+*]:mt-6', className)}>{children}</div>
}

export function AeSiteStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid [&>*+*]:mt-10 md:[&>*+*]:mt-20', className)}>{children}</div>
}

/** Left-split editorial hero. Centered is not the default. */
export function AeSiteHeroIntro({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid w-full content-start gap-4 text-left lg:gap-6', className)}>
      {children}
    </div>
  )
}

/** Two blocks with a plus-tipped divider — Twenty FooterNav group rhythm. */
export function AeSiteSplitPair({
  left,
  right,
}: {
  left: ReactNode
  right: ReactNode
}) {
  return (
    <div className="grid gap-page md:grid-cols-[1fr_auto_1fr] md:items-stretch">
      {left}
      <div className="hidden md:block">
        <AeMarkedDivider orientation="vertical" />
      </div>
      <div className="md:hidden">
        <AeMarkedDivider orientation="horizontal" />
      </div>
      {right}
    </div>
  )
}
