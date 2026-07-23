import { useLayoutEffect, useRef, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'

import {
  comparisonSelectionId,
  type ResolvedComparisonSelection,
} from '@/modules/comparison/public'

export type AeShortlistBarProps = Readonly<{
  selections: readonly ResolvedComparisonSelection[]
  compareHref?: string
  onRemove: (selectionId: string) => void
}>

export function AeShortlistBar({ selections, compareHref, onRemove }: AeShortlistBarProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const removeRefs = useRef<Array<HTMLButtonElement | null>>([])
  const pendingRemoval = useRef<Readonly<{ selectionId: string; index: number }> | undefined>(undefined)
  const [announcement, setAnnouncement] = useState('')

  useLayoutEffect(() => {
    const pending = pendingRemoval.current
    if (pending === undefined) return
    if (selections.some((item) => comparisonSelectionId(item.selection) === pending.selectionId)) return
    pendingRemoval.current = undefined
    const index = pending.index
    const target = removeRefs.current[index] ?? removeRefs.current[index - 1] ?? headingRef.current
    target?.focus()
  }, [selections])

  function remove(index: number) {
    const item = selections[index]
    if (item === undefined) return
    onRemove(comparisonSelectionId(item.selection))
    setAnnouncement(`${item.offering.name} removed. ${Math.max(0, selections.length - 1)} selected.`)
    pendingRemoval.current = {
      selectionId: comparisonSelectionId(item.selection),
      index,
    }
  }

  return (
    <section aria-labelledby="comparison-shortlist-heading">
      <Card padding={4} className="grid gap-4 border border-border bg-muted/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading
          id="comparison-shortlist-heading"
          level={2}
          ref={headingRef}
          tabIndex={-1}
        >
          Selected for comparison
        </Heading>
        <Text type="supporting" color="secondary">
          {selections.length} of 4 selected
        </Text>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {selections.map((item, index) => (
          <li key={comparisonSelectionId(item.selection)} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <Text weight="semibold">{item.offering.name}</Text>{' '}
              <Text type="supporting" color="secondary">
                {item.business.name} · Revision {item.offering.revision}
              </Text>
            </span>
            <button
              ref={(element) => { removeRefs.current[index] = element }}
              type="button"
              aria-pressed="true"
              className="min-h-11 rounded-md px-3 text-sm font-semibold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
              onClick={() => remove(index)}
            >
              Remove {item.offering.name} from comparison
            </button>
          </li>
        ))}
      </ul>
      {selections.length === 1 ? (
        <Text id="comparison-shortlist-help" type="supporting" color="secondary">
          Add one more Offering to compare.
        </Text>
      ) : null}
      {selections.length >= 4 ? (
        <Text type="supporting" color="secondary">Maximum 4 Offerings selected.</Text>
      ) : null}
      <div aria-live="polite" role="status" className="sr-only">{announcement}</div>
      {compareHref === undefined || selections.length < 2 ? (
        <button type="button" className="min-h-11 rounded-md px-4 font-semibold" disabled>
          Compare {selections.length} {selections.length === 1 ? 'Offering' : 'Offerings'}
        </button>
      ) : (
        <a
          href={compareHref}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Compare {selections.length} Offerings
        </a>
      )}
      </Card>
    </section>
  )
}
