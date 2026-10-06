import { useEffect, useRef, useState } from 'react'
import type { ComparisonColumn } from './comparison-table.contracts'

export function useAeComparisonTable(columns: readonly ComparisonColumn[]) {
  const rootRef = useRef<HTMLElement>(null)
  const [narrow, setNarrow] = useState(false)
  const [differencesOnly, setDifferencesOnly] = useState(false)
  const [peer, setPeer] = useState<string>()
  const anchor = columns[0]
  const others = columns.slice(1)
  // A removed or unavailable selection never leaves a stale phone column.
  const compareWith = others.some(column => column.id === peer) ? peer : others[0]?.id

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => { if (entry) setNarrow(entry.contentRect.width < 680) })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const visible = !narrow || !anchor
    ? columns
    : columns.filter(column => column.id === anchor.id || column.id === compareWith)

  return { rootRef, narrow, differencesOnly, setDifferencesOnly, compareWith, setCompareWith: setPeer, anchor, others, visible }
}
