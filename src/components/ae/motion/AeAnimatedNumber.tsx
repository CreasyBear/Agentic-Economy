import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

export function AeAnimatedNumber({
  value,
  duration = 700,
  format,
}: {
  value: number
  duration?: number
  format?: (value: number) => string
}) {
  const reduce = useReducedMotion()
  const [displayValue, setDisplayValue] = useState(value)
  const lastValueRef = useRef(value)
  const formatter = useMemo(() => format ?? ((next: number) => new Intl.NumberFormat('en-AU').format(next)), [format])

  useEffect(() => {
    if (reduce) {
      setDisplayValue(value)
      lastValueRef.current = value
      return
    }

    const startValue = lastValueRef.current
    const delta = value - startValue
    if (delta === 0) {
      return
    }

    const startedAt = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = now - startedAt
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(startValue + delta * eased))
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        lastValueRef.current = value
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, reduce, value])

  return <span data-numeric>{formatter(displayValue)}</span>
}
