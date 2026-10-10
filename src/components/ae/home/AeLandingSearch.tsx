import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { MarketCategoryRow } from '@/components/ae/market/MarketCategoryRow'
import { MarketSearchPill } from '@/components/ae/market/MarketSearchPill'
import { PUBLIC_SURFACE } from '@/content/brand-copy'

import type { LandingData } from './landing.functions'
import styles from './AeLanding.module.css'

/**
 * Airbnb's search-first hero: the /market search pill and the /market chip row, so the two pages
 * share one search bar and one category bar. Both work before hydration.
 * The live tool count joins the placeholder when the directory read lands; the field never remounts.
 */
export function AeLandingSearch({ data }: Readonly<{ data?: Promise<LandingData> | undefined }>) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [toolCount, setToolCount] = useState<number>()
  useEffect(() => {
    let live = true
    void data?.then(resolved => { if (live) setToolCount(resolved.stats?.totalTools) }, () => undefined)
    return () => { live = false }
  }, [data])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    void navigate({ to: '/market', search: trimmed === '' ? {} : { query: trimmed, sort: 'relevance' } })
  }

  return (
    <div className={styles.search}>
      <MarketSearchPill label={PUBLIC_SURFACE.searchLabel} value={query} onValueChange={setQuery} onSubmit={submit}
        field={{ placeholder: PUBLIC_SURFACE.searchPlaceholder(toolCount === undefined ? undefined : toolCount.toLocaleString('en-AU')) }} />
      <MarketCategoryRow align="center" />
    </div>
  )
}
