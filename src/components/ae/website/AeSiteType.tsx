import { Fragment, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { SiteMarker } from '@/components/ui/site-marker'

import { AeMarkedDivider } from './AeSiteMarks'
import { parseHeadingNotation } from './heading-notation'

export type AeSiteHeadingLevel = 'h1' | 'h2' | 'h3'
export type AeSiteHeadingSize = 'xl' | 'lg' | 'md' | 'sm' | 'xs'

type AeSiteHeadingProps = {
  as?: AeSiteHeadingLevel
  size?: AeSiteHeadingSize
  children: string
  id?: string
  className?: string
}

const sizeClass: Record<AeSiteHeadingSize, string> = {
  xl: 'font-display text-6xl font-medium leading-[1.04] tracking-tight sm:text-7xl',
  lg: 'font-display text-5xl font-medium leading-[1.08] tracking-tight sm:text-6xl',
  md: 'font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl',
  sm: 'font-display text-2xl font-medium tracking-tight sm:text-3xl',
  xs: 'font-sans text-lg font-medium tracking-tight sm:text-xl',
}

export function AeSiteHeading({
  as: Tag = 'h2',
  size = 'md',
  children,
  id,
  className,
}: AeSiteHeadingProps) {
  let offset = 0
  const segments = parseHeadingNotation(children).map((segment) => {
    const text = segment.kind === 'break' ? '' : segment.text
    const keyed = { key: `${segment.kind}-${offset}`, kind: segment.kind, text }
    offset += text.length + (segment.kind === 'break' ? 1 : 0)
    return keyed
  })

  return (
    <Tag id={id} className={cn('text-balance', sizeClass[size], className)}>
      {segments.map((segment) =>
        segment.kind === 'accent' ? (
          <span key={segment.key} className="font-sans font-medium tracking-tight">
            {segment.text}
          </span>
        ) : segment.kind === 'break' ? (
          <br key={segment.key} />
        ) : (
          <Fragment key={segment.key}>{segment.text}</Fragment>
        ),
      )}
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
        'ae-site-body max-w-prose text-pretty',
        size === 'md' ? 'text-lg leading-7 sm:text-xl sm:leading-8' : 'text-base leading-7 sm:text-lg sm:leading-8',
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
    <p className="ae-site-eyebrow inline-flex items-center gap-2 font-sans text-xs font-medium tracking-tight text-muted-foreground">
      <SiteMarker tone="info" visible dataMarker />
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

/** Centered display hero stack — Twenty HomeHero IntroStack (32px authored gap). */
export function AeSiteHeroIntro({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex w-full flex-col items-center text-center [&>*+*]:mt-8', className)}>
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
