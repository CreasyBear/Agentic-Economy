import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

export type MagicNumberProps = {
  value: string | number
  className?: string
}

/**
 * Digit pop-in for a numeric/count display (port of transitions.dev's
 * number-pop-in). Splits the string into per-character spans that rise in
 * from the direction with a blur, staggered on the last two characters so
 * decimals feel alive. Plays once on mount; every rule is reduced-motion
 * guarded in CSS.
 */
export function MagicNumber({ value, className }: MagicNumberProps) {
  const [animating, setAnimating] = useState(false)
  useEffect(() => {
    setAnimating(true)
  }, [])
  const text = String(value)
  const chars = Array.from(text)
  return (
    <span className={cn('magic-digit-group', animating && 'is-animating', className)} aria-label={text}>
      {chars.map((char, index) => (
        <span
          key={`${index}-${char}`}
          className="magic-digit"
          data-stagger={index >= chars.length - 2 ? String(chars.length - 1 - index) : undefined}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  )
}
