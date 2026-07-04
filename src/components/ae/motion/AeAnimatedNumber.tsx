import { useEffect, useMemo, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

const defaultNumberFormatter = new Intl.NumberFormat('en-AU')

function formatDefaultNumber(value: number): string {
  return defaultNumberFormatter.format(value)
}

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
  const outputRef = useRef<HTMLSpanElement>(null)
  const lastValueRef = useRef(value)
  const currentValueRef = useRef(value)
  const formatter = useMemo(() => format ?? formatDefaultNumber, [format])

  useEffect(() => {
    const output = outputRef.current
    if (output === null) {
      return
    }

    if (reduce) {
      currentValueRef.current = value
      lastValueRef.current = value
      output.textContent = formatter(currentValueRef.current)
      return
    }

    const startValue = lastValueRef.current
    const delta = value - startValue
    if (delta === 0) {
      output.textContent = formatter(currentValueRef.current)
      return
    }

    const startedAt = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = now - startedAt
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      currentValueRef.current = Math.round(startValue + delta * eased)
      output.textContent = formatter(currentValueRef.current)
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        lastValueRef.current = value
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, formatter, reduce, value])

  return <span ref={outputRef} data-numeric>{formatter(currentValueRef.current)}</span>
}
