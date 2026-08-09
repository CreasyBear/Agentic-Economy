import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type MagicTiltProps = {
  children: ReactNode
  className?: string
  cardClassName?: string
}

/** Peak tilt in degrees at the card edges — reads as a subtle, tasteful lean. */
const MAX_TILT = 10

/**
 * Card hover tilt (port of transitions.dev's card-tilt). The pointer is
 * tracked on the OUTER flat wrapper (never transforms, so the rotated card
 * can't flicker its own edges out from under the cursor); the inner card
 * rotates and carries a cursor-tracked glare. Pointer-only, skipped when
 * `prefers-reduced-motion: reduce` is set, and touch drags tilt on mobile.
 */
export function MagicTilt({ children, className, cardClassName }: MagicTiltProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(() => {
    const wrap = wrapRef.current
    const card = cardRef.current
    if (wrap === null || card === null) return
    wrap.classList.remove('is-hover')
    card.classList.remove('is-tilting')
    card.style.setProperty('--tilt-rx', '0deg')
    card.style.setProperty('--tilt-ry', '0deg')
  }, [])

  const track = useCallback((clientX: number, clientY: number) => {
    const wrap = wrapRef.current
    const card = cardRef.current
    if (wrap === null || card === null) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = wrap.getBoundingClientRect()
    const px = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    const py = Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height))
    wrap.classList.add('is-hover')
    card.classList.add('is-tilting')
    card.style.setProperty('--tilt-ry', `${((px - 0.5) * MAX_TILT).toFixed(2)}deg`)
    card.style.setProperty('--tilt-rx', `${((0.5 - py) * MAX_TILT).toFixed(2)}deg`)
    card.style.setProperty('--tilt-gx', `${(px * 100).toFixed(1)}%`)
    card.style.setProperty('--tilt-gy', `${(py * 100).toFixed(1)}%`)
  }, [])

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    track(event.clientX, event.clientY)
  }
  function handlePointerLeave(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') reset()
  }

  return (
    <div
      ref={wrapRef}
      className={cn('magic-tilt h-full', className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerUp={reset}
    >
      <div ref={cardRef} className={cn('magic-tilt-card h-full', cardClassName)}>
        {children}
        <span className="magic-tilt-glare" aria-hidden="true" />
      </div>
    </div>
  )
}
