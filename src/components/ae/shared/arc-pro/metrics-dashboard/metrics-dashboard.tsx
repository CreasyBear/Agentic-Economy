"use client";

/* Adapted from the Arc metrics dashboard source.
 * Original SHA-256: 1f39789beb44845ffaea58b92289d6b82b8cd160f82a0c99ca8bb5ff056e3730
 */
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { formatCount } from '@/lib/ui/format-time'
import styles from './metrics-dashboard.module.css'

export type MetricCard = Readonly<{ label: string; value: string; delta?: string }>
export type MetricRatio = Readonly<{ label: string; value: string }>
export type DailyCallPoint = Readonly<{ day: string; attemptedCalls: number; completedCalls: number; uncertainCalls: number }>

type MetricKey = 'attemptedCalls' | 'completedCalls' | 'uncertainCalls'
type Coordinate = readonly [number, number]

const seriesOptions = [
  { key: 'attemptedCalls', label: 'Attempted Calls' },
  { key: 'completedCalls', label: 'Completed Calls' },
  { key: 'uncertainCalls', label: 'Uncertain Calls' },
] as const satisfies readonly Readonly<{ key: MetricKey; label: string }>[]

const W = 600
const H = 180
export type MetricsDashboardProps = Readonly<{
  cards: readonly MetricCard[]
  ratios: readonly MetricRatio[]
  dailyCalls: readonly DailyCallPoint[]
  controls: ReactNode
  coverageDescription?: string
  withheldMetricLabels?: readonly string[]
}>

export type MetricsSummaryProps = Readonly<{
  cards: readonly MetricCard[]
  unavailable?: boolean
}>

export function MetricsSummary({ cards, unavailable = false }: MetricsSummaryProps) {
  return (
    <dl className={styles.kpis} data-count={cards.length}>
      {cards.map((card) => (
        <div key={card.label} className={styles.kpi} data-unavailable={unavailable || undefined}>
          <dt className={styles.kpiLabel}>{card.label}</dt>
          <dd className={styles.kpiValue}>{card.value}</dd>
          {card.delta !== undefined ? <dd className={styles.kpiDelta}>{card.delta}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

/** The genuine dashboard frame and KPI region, shared by live metric projections. */
export function MetricsOverview({ title, cards, controls, coverageDescription, unavailable = false, label, children }: Readonly<{
  title: string
  cards: readonly MetricCard[]
  controls?: ReactNode
  coverageDescription?: string
  unavailable?: boolean
  label?: string
  children: ReactNode
}>) {
  return <section className={'arc-market ' + styles.dashboard} aria-label={label ?? title}>
    <header className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {controls === undefined ? null : <div className={styles.actions}>{controls}</div>}
    </header>
    {coverageDescription === undefined ? null : <p className={styles.coverageNotice} role="status">{coverageDescription}</p>}
    <MetricsSummary cards={cards} unavailable={unavailable} />
    {children}
  </section>
}

/** The source dashboard's inspectable section, without a synthetic chart or series. */
export function MetricsPanel({ title, titleId, description, action, children }: Readonly<{
  title: string
  titleId?: string
  description?: string
  action?: ReactNode
  children: ReactNode
}>) {
  const generatedId = useId()
  const id = titleId ?? generatedId
  return <section className={styles.chartSection} aria-labelledby={id}>
    <div className={styles.chartBar}>
      <h3 id={id} className={styles.chartTitle}>{title}</h3>
      {action}
    </div>
    {description === undefined ? null : <p className={styles.chartDescription}>{description}</p>}
    <div className={description === undefined ? undefined : styles.panelDetails}>{children}</div>
  </section>
}

function niceScale(max: number) {
  const span = max || 1
  const raw = span / 3
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, Math.ceil([1, 2, 2.5, 5, 10].map((multiplier) => multiplier * magnitude).find((candidate) => candidate >= raw) ?? raw))
  return { min: 0, max: step * 3, ticks: [0, 1, 2, 3].map((index) => step * index) }
}

function smoothPath(points: readonly Coordinate[]) {
  return points.map(([x, y], index) => (index ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ')
}

// Requires complete daily snapshots and preformatted authoritative aggregate values.
// Ensures incomplete coverage shows unavailable aggregates and only recorded daily points.
// Invariant: no money parsing, inferred days, totals or previous-period comparisons.
// On unavailable coverage, withhold aggregates; an empty daily series stays explicitly empty.
export function MetricsDashboard({ cards, ratios, dailyCalls, controls, coverageDescription, withheldMetricLabels = [] }: MetricsDashboardProps) {
  const uid = useId()
  const reduceMotion = useReducedMotion() === true
  const [metricKey, setMetricKey] = useState<MetricKey>('attemptedCalls')
  const [active, setActive] = useState<number | null>(null)

  const points = useMemo(
    () => [...dailyCalls].sort((left, right) => (left.day < right.day ? -1 : left.day > right.day ? 1 : 0)),
    [dailyCalls],
  )
  const metric = seriesOptions.find((option) => option.key === metricKey) ?? seriesOptions[0]
  const activeIndex = active === null || points.length === 0
    ? null
    : Math.min(points.length - 1, Math.max(0, active))
  const focus = activeIndex === null ? null : points[activeIndex] ?? null
  const totalsWithheld = coverageDescription !== undefined
  const displayedCards = totalsWithheld
    ? withheldMetricLabels.map((label) => ({ label, value: 'Not available', delta: 'Range totals withheld' }))
    : cards
  const observationDescription = points.length === 1
    ? 'Showing 1 recorded daily snapshot. Missing days are not plotted.'
    : `Showing ${formatCount(points.length)} recorded daily snapshots. Missing days are not plotted.`

  const chart = useMemo(() => {
    const maxCount = points.reduce((max, point) => Math.max(max, point[metricKey]), 0)
    const scale = niceScale(maxCount)
    const span = Math.max(1, scale.max - scale.min)
    const x = (index: number) => (points.length === 1 ? W / 2 : (index / (points.length - 1)) * W)
    const y = (value: number) => H - ((value - scale.min) / span) * H
    const hasCalendarGaps = points.some((point, index) => {
      const previous = points[index - 1]
      return previous !== undefined && Date.parse(point.day) - Date.parse(previous.day) !== 86_400_000
    })
    const current = smoothPath(points.map((point, index) => [x(index), y(point[metricKey])] as const))
    // A continuous line is meaningful only for a complete contiguous daily series.
    const continuous = !totalsWithheld && !hasCalendarGaps && points.length > 1
    return {
      scale,
      x,
      y,
      current,
      continuous,
      area: continuous ? current + ' L' + W + ' ' + H + ' L0 ' + H + ' Z' : '',
    }
  }, [metricKey, points, totalsWithheld])

  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const swap = reduceMotion ? { duration: 0 } : motionTokens.spring.smooth

  function inspect(event: PointerEvent<HTMLDivElement>) {
    if (points.length === 0) return
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))))
  }

  function onChartKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
    if (points.length === 0) return
    event.preventDefault()
    const last = points.length - 1
    setActive((current) => {
      const currentIndex = current === null ? null : Math.min(last, Math.max(0, current))
      if (event.key === 'Home') return 0
      if (event.key === 'End') return last
      const from = currentIndex ?? last
      return Math.min(last, Math.max(0, from + (event.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const focusY = focus === null ? 0 : chart.y(focus[metricKey]) / H
  const tooltipLeft = focus === null || activeIndex === null
    ? 0
    : Math.min(88, Math.max(12, (chart.x(activeIndex) / W) * 100))

  return (
    <MetricsOverview title="Headline metrics" label="Metrics dashboard" cards={displayedCards} controls={controls}
      unavailable={totalsWithheld} {...(coverageDescription === undefined ? {} : { coverageDescription })}>
      <MetricsPanel title="Daily Calls" titleId={uid + '-daily-calls'} action={
          <div className={styles.seriesControls} role="group" aria-label="Daily Call series">
            {seriesOptions.map((option) => {
              const selected = metricKey === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  className={styles.seriesButton}
                  aria-pressed={selected}
                  onClick={() => {
                    setMetricKey(option.key)
                    setActive(null)
                  }}
                >
                  {selected ? (
                    <motion.span
                      layoutId={uid + '-series'}
                      className={styles.seriesThumb}
                      transition={swap}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className={styles.seriesLabel}>{option.label}</span>
                </button>
              )
            })}
          </div>
      }>

        {points.length > 0 ? (
          <p id={uid + '-snapshot-scope'} className={styles.chartDescription}>{observationDescription}</p>
        ) : null}

        {points.length === 0 ? (
          <p className={styles.empty}>No daily Call snapshots recorded.</p>
        ) : (
          <div className={styles.plot}>
            <div className={styles.yAxis} aria-hidden="true">
              {[...chart.scale.ticks].reverse().map((tick, index) => (
                <span key={index}>{formatCount(tick)}</span>
              ))}
            </div>
            <div
              className={styles.chartArea}
              tabIndex={0}
              role="img"
              aria-label={metric.label + ', recorded daily snapshots. Use arrow keys to inspect values.'}
              aria-describedby={uid + '-snapshot-scope'}
              onPointerMove={inspect}
              onPointerDown={inspect}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') setActive(null)
              }}
              onKeyDown={onChartKeyDown}
              onBlur={() => setActive(null)}
            >
              <div className={styles.grid} aria-hidden="true">
                {chart.scale.ticks.map((tick, index) => (
                  <span key={index} />
                ))}
              </div>
              <svg
                className={styles.svg}
                viewBox={'0 0 ' + W + ' ' + H}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {chart.continuous ? (
                  <>
                    <path className={styles.area} d={chart.area} />
                    <path className={styles.line} d={chart.current} />
                  </>
                ) : null}
                {points.map((point, index) => (
                  <circle
                    key={point.day}
                    className={styles.observation}
                    cx={chart.x(index)}
                    cy={chart.y(point[metricKey])}
                    r={4}
                  />
                ))}
              </svg>
              {focus !== null && activeIndex !== null ? (
                <>
                  <span
                    className={styles.crosshair}
                    style={{ left: (chart.x(activeIndex) / W) * 100 + '%' }}
                    aria-hidden="true"
                  />
                  <span
                    className={styles.dot}
                    style={{ left: (chart.x(activeIndex) / W) * 100 + '%', top: (chart.y(focus[metricKey]) / H) * 100 + '%' }}
                    aria-hidden="true"
                  />
                  <div
                    className={styles.tooltip}
                    style={{ left: tooltipLeft + '%', ...(focusY < 0.5 ? { top: 'auto', bottom: 6 } : {}) }}
                    role="status"
                  >
                    <span className={styles.tooltipDate}>{focus.day}</span>
                    <strong>{formatCount(focus[metricKey])}</strong>
                  </div>
                </>
              ) : null}
            </div>
            <div className={styles.xAxis} aria-hidden="true">
              {points.map((point, index) => {
                if (index % labelEvery !== 0 && index !== points.length - 1) return null
                const percent = (chart.x(index) / W) * 100
                return (
                  <span
                    key={point.day}
                    style={{ left: percent + '%', transform: 'translateX(' + (index === 0 ? 0 : percent > 92 ? -100 : -50) + '%)' }}
                  >
                    {point.day.slice(5)}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </MetricsPanel>

      {totalsWithheld ? null : <section className={styles.ratioSection} aria-labelledby={uid + '-ratios'}>
        <h3 id={uid + '-ratios'} className={styles.ratioTitle}>Ratios</h3>
        <dl className={styles.breakdowns}>
          {ratios.map((ratio) => (
            <div key={ratio.label} className={styles.breakdown}>
              <dt className={styles.ratioLabel}>{ratio.label}</dt>
              <dd className={styles.ratioValue}>{ratio.value}</dd>
            </div>
          ))}
        </dl>
      </section>}
    </MetricsOverview>
  )
}
