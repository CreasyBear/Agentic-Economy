import { Link } from '@tanstack/react-router'

import { DirectoryToolCard, type DirectoryToolCardControls } from '@/components/ae/market/DirectoryToolList'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

import { LANDING_COPY, POPULAR_COUNT, ROW_COUNT } from './landing-content'
import type { LandingRow } from './landing.functions'
import styles from './AeLanding.module.css'

function RowHead({ id, title, link }: Readonly<{ id: string; title: string; link: Readonly<{ label: string; ariaLabel: string; query?: string }> }>) {
  return (
    <header className={styles.rowHead}>
      <h2 id={id} className={styles.rowTitle}>{title}</h2>
      <Link to="/market" search={link.query === undefined ? {} : { query: link.query, sort: 'relevance' }} className={styles.rowLink} aria-label={link.ariaLabel}>
        {link.label}
      </Link>
    </header>
  )
}

/**
 * Airbnb's home grid: the directory's most used listings, on the /market card, always shown under the hero
 * while the directory answers. Two rows of four on a laptop, a swipeable rail on a phone.
 */
export function AePopularTools({ entries }: Readonly<{ entries: readonly X402DirectoryEntry[] }>) {
  if (entries.length === 0) return null
  return (
    <div className={styles.rows}>
      <section className={styles.row} aria-labelledby="landing-popular">
        <RowHead id="landing-popular" title={LANDING_COPY.popularTitle} link={{ label: LANDING_COPY.popularLink, ariaLabel: LANDING_COPY.popularLink }} />
        <ul className={styles.grid}>
          {entries.map(entry => <li key={entry.resource}><DirectoryToolCard entry={entry} /></li>)}
        </ul>
      </section>
    </div>
  )
}

/**
 * Category rows of real listings on the one /market card, each titled with its "Show all" search, like Airbnb's home rows.
 * The directory answered, so no row means none filled honestly: the page goes on without rows rather than blame a timeout.
 */
export function AeToolRows({ rows, controls }: Readonly<{ rows: readonly LandingRow[]; controls?: DirectoryToolCardControls | undefined }>) {
  if (rows.length === 0) return null
  return (
    <div className={styles.rows}>
      {rows.map(row => (
        <section key={row.id} className={styles.row} aria-labelledby={`landing-row-${row.id}`}>
          <RowHead id={`landing-row-${row.id}`} title={row.title} link={{ label: LANDING_COPY.showAll, ariaLabel: LANDING_COPY.showAllLabel(row.title), query: row.query }} />
          <ul className={styles.rail}>
            {row.entries.map(entry => <li key={entry.resource}><DirectoryToolCard entry={entry} controls={controls} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Shown only when the directory has never answered: a reason, the way on, and a retry when the page can make one. */
export function LandingRowsUnavailable({ onRetry }: Readonly<{ onRetry?: () => void }>) {
  return (
    <div className={styles.empty}>
      <EmptyState
        title={LANDING_COPY.rowsUnavailableTitle}
        description={LANDING_COPY.rowsUnavailableBody}
        titleAs="h2"
        action={(
          <>
            {onRetry === undefined ? null : <Button variant="secondary" onClick={onRetry}>{LANDING_COPY.retry}</Button>}
            <Link to="/market" className={styles.rowLink}>{LANDING_COPY.rowsUnavailableAction}</Link>
          </>
        )}
      />
    </div>
  )
}

/**
 * Linear-style loading: the popular grid and as many rows as the page keeps, shaped like the final cards,
 * so the page does not jump when the directory lands. One status line speaks for the whole wait.
 */
export function LandingRowsSkeleton({ grid = true }: Readonly<{ grid?: boolean }>) {
  const card = (key: number) => <li key={key}><div className={styles.skeletonCard}><Skeleton lines={4} label={LANDING_COPY.loadingTools} /></div></li>
  return (
    <div className={styles.rows} aria-busy="true">
      <p className="sr-only" role="status">{LANDING_COPY.loadingTools}</p>
      {grid ? (
        <div className={styles.row} aria-hidden="true">
          <div className={styles.skeletonTitle}><Skeleton lines={1} label={LANDING_COPY.loadingTools} /></div>
          <ul className={styles.grid}>{Array.from({ length: POPULAR_COUNT }, (_, index) => card(index))}</ul>
        </div>
      ) : null}
      {Array.from({ length: ROW_COUNT }, (_, row) => (
        <div key={row} className={styles.row} aria-hidden="true">
          <div className={styles.skeletonTitle}><Skeleton lines={1} label={LANDING_COPY.loadingTools} /></div>
          <ul className={styles.rail}>{[0, 1, 2, 3].map(card)}</ul>
        </div>
      ))}
    </div>
  )
}
