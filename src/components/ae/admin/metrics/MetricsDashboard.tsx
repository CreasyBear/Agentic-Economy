"use client";

/* Adapted from the Arc metrics dashboard source.
 * Original SHA-256: 1f39789beb44845ffaea58b92289d6b82b8cd160f82a0c99ca8bb5ff056e3730
 */
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { motionTokens } from '@/components/arc/motion-tokens'
import { formatCount } from '@/lib/ui/format-time'
import type { AdminMetricCallPoint, AdminMetricCard, AdminMetricRatio } from './metrics.contracts'
import styles from './MetricsDashboard.module.css'

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
  cards: readonly AdminMetricCard[]
  ratios: readonly AdminMetricRatio[]
  dailyCalls: readonly AdminMetricCallPoint[]
  controls: ReactNode
}>

function niceScale(min: number, max: number, percent: boolean) {
  const lower = percent ? Math.max(0, min - (max - min) * 0.6) : 0
  const span = max - lower || 1
  const raw = span / 3
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((multiplier) => multiplier * magnitude).find((candidate) => candidate >= raw) ?? raw
  const start = Math.floor(lower / step) * step
  return { min: start, max: start + step * 3, ticks: [0, 1, 2, 3].map((index) => start + step * index) }
}

function smoothPath(points: readonly Coordinate[]) {
  return points.map(([x, y], index) => (index ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ')
}

export function MetricsDashboard({ cards, ratios, dailyCalls, controls }: MetricsDashboardProps) {
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

  const chart = useMemo(() => {
    const maxCount = points.reduce((max, point) => Math.max(max, point[metricKey]), 0)
    const scale = niceScale(0, maxCount, false)
    const span = Math.max(1, scale.max - scale.min)
    const x = (index: number) => (points.length === 1 ? W / 2 : (index / (points.length - 1)) * W)
    const y = (value: number) => H - ((value - scale.min) / span) * H
    const current = smoothPath(points.map((point, index) => [x(index), y(point[metricKey])] as const))
    return {
      scale,
      x,
      y,
      current,
      area: points.length > 1 ? current + ' L' + W + ' ' + H + ' L0 ' + H + ' Z' : '',
    }
  }, [metricKey, points])

  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const onlyPoint = points.length === 1 ? points[0] : undefined
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
    <section className={'arc-market ' + styles.dashboard} aria-label="Metrics dashboard">
      <header className={styles.header}>
        <h2 className={styles.title}>Headline metrics</h2>
        <div className={styles.actions}>{controls}</div>
      </header>

      <div className={styles.kpis}>
        {cards.map((card) => (
          <article key={card.label} className={styles.kpi}>
            <p className={styles.kpiLabel}>{card.label}</p>
            <p className={styles.kpiValue}>{card.value}</p>
            <p className={styles.kpiDelta}>{card.delta}</p>
          </article>
        ))}
      </div>

      <section className={styles.chartSection} aria-labelledby={uid + '-daily-calls'}>
        <div className={styles.chartBar}>
          <h3 id={uid + '-daily-calls'} className={styles.chartTitle}>Daily Calls</h3>
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
        </div>

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
                <path className={styles.area} d={chart.area} />
                <path className={styles.line} d={chart.current} />
                {onlyPoint === undefined ? null : (
                  <circle
                    cx={chart.x(0)}
                    cy={chart.y(onlyPoint[metricKey])}
                    r={3.5}
                    fill="var(--surface)"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
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
      </section>

      <section className={styles.ratioSection} aria-labelledby={uid + '-ratios'}>
        <h3 id={uid + '-ratios'} className={styles.ratioTitle}>Ratios</h3>
        <dl className={styles.breakdowns}>
          {ratios.map((ratio) => (
            <div key={ratio.label} className={styles.breakdown}>
              <dt className={styles.ratioLabel}>{ratio.label}</dt>
              <dd className={styles.ratioValue}>{ratio.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  )
}
