import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type AeSiteScheme = 'canvas' | 'surface' | 'muted' | 'ink'
export type AeSiteRhythm = 'section' | 'hero' | 'spacious' | 'flush'

type AeSiteSectionProps = {
  labelledBy?: string
  ariaLabel?: string
  scheme?: AeSiteScheme
  rhythm?: AeSiteRhythm
  background?: ReactNode
  children: ReactNode
  id?: string
  keepTopRhythm?: boolean
  connectsUp?: boolean
  clip?: boolean
  className?: string
}

export function AeSiteSection({
  labelledBy,
  ariaLabel,
  scheme = 'canvas',
  rhythm = 'section',
  background,
  children,
  id,
  keepTopRhythm = false,
  connectsUp = false,
  clip = true,
  className,
}: AeSiteSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      data-ae-scheme={scheme}
      data-ae-rhythm={rhythm}
      {...(keepTopRhythm ? { 'data-ae-keep-top': '' } : {})}
      {...(connectsUp ? { 'data-ae-connect-up': '' } : {})}
      className={cn(
        'relative w-full min-w-0',
        clip ? 'overflow-clip' : 'overflow-visible',
        schemeClass(scheme),
        rhythmClass(rhythm),
        className,
      )}
    >
      {background === undefined ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 mx-auto max-w-[var(--ae-rail)]"
        >
          {background}
        </div>
      )}
      <div className="ae-rail relative z-1 w-full">{children}</div>
    </section>
  )
}

function schemeClass(scheme: AeSiteScheme): string {
  switch (scheme) {
    case 'canvas':
      return 'bg-background text-foreground'
    case 'surface':
      return 'bg-container text-foreground'
    case 'muted':
      return 'bg-muted text-foreground'
    case 'ink':
      return 'bg-foreground text-background'
    default: {
      const _never: never = scheme
      return _never
    }
  }
}

function rhythmClass(rhythm: AeSiteRhythm): string {
  switch (rhythm) {
    case 'section':
      return 'py-page md:py-band'
    case 'hero':
      return 'py-section md:py-page'
    case 'spacious':
      return 'py-band md:py-hero'
    case 'flush':
      return 'overflow-visible py-0'
    default: {
      const _never: never = rhythm
      return _never
    }
  }
}
