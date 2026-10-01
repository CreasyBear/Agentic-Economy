"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { Download } from "lucide-react";
import { motionTokens } from "../../lib/motion-tokens";
import styles from "./metrics-dashboard.module.css";

/** ARC Pro metrics-dashboard, adapted to authorized AE snapshots. No demonstration data. */
export type DashboardPoint = Readonly<{ date: string; value: number | null }>
export type DashboardMetric = Readonly<{
  key: string; label: string; value: number | null; description: string; points: readonly DashboardPoint[]
}>
export type DashboardRange = 'last_7' | 'last_30' | 'last_90'
export type MetricsDashboardProps = Readonly<{
  metrics: readonly [DashboardMetric, ...DashboardMetric[]]
  range: DashboardRange
  onRangeChange: (range: DashboardRange) => void
  description: string
  notice?: string
  exportHref?: string
}>
const ranges: readonly { value: DashboardRange; label: string; long: string }[] = [
  { value: 'last_7', label: '7 days', long: 'Last 7 days' },
  { value: 'last_30', label: '30 days', long: 'Last 30 days' },
  { value: 'last_90', label: '90 days', long: 'Last 90 days' },
]
const countFormat = new Intl.NumberFormat("en-AU");
const compactFormat = new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric", timeZone: "UTC" });
const formatValue = (value: number) => countFormat.format(Math.round(value));
const formatAxis = (value: number) => compactFormat.format(value);
const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

function niceScale(min: number, max: number, percent: boolean) {
  const lo = percent ? Math.max(0, min - (max - min) * 0.6) : 0;
  const span = max - lo || 1;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  return { min: start, max: start + step * 3, ticks: [0, 1, 2, 3].map((i) => start + step * i) };
}

/** Counts a number to its new value with tabular numerals; reduced motion swaps it instantly. */
function CountValue({ value, format }: { value: number; format: (value: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const formatRef = useRef(format);
  const [initial] = useState(() => format(value));
  const reduce = useReducedMotion();
  useEffect(() => { formatRef.current = format; }, [format]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) { shown.current = value; node.textContent = formatRef.current(value); return; }
    const controls = animate(shown.current, value, {
      duration: motionTokens.duration.considered,
      ease: motionTokens.ease.standard,
      onUpdate: (v) => { shown.current = v; node.textContent = formatRef.current(v); },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <span ref={ref}>{initial}</span>;
}

/** Monotone cubic path: smooth without overshooting past the real data points. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return pts.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join(" ");
  const n = pts.length;
  const slope = pts.slice(1).map(([x, y], i) => (y - (pts[i]?.[1] ?? y)) / (x - (pts[i]?.[0] ?? x)));
  const tangent = pts.map((_, i) => {
    if (i === 0) return (slope[0] ?? 0);
    if (i === n - 1) return (slope[n - 2] ?? 0);
    const a = (slope[i - 1] ?? 0), b = slope[i] ?? 0;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  const first = pts[0];
  if (!first) return "";
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const from = pts[i], to = pts[i + 1];
    if (!from || !to) continue;
    const [x0, y0] = from, [x1, y1] = to, h = (x1 - x0) / 3;
    d += ` C${(x0 + h).toFixed(1)} ${(y0 + (tangent[i] ?? 0) * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - (tangent[i + 1] ?? 0) * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

const W = 600;
const H = 180;

export function MetricsDashboard({ metrics, range, onRangeChange, description, notice, exportHref }: MetricsDashboardProps) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [metricKey, setMetricKey] = useState(metrics[0].key);
  const [active, setActive] = useState<number | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState<"lg" | "md" | "sm">("lg");

  // Layout follows the block's own width so it works in narrow previews as well as full pages.
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = (width: number) => setSize(width < 460 ? "sm" : width < 640 ? "md" : "lg");
    measure(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => { if (entry) measure(entry.contentRect.width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const points = metric.points;
  const rangeInfo = ranges.find((r) => r.value === range) ?? ranges[0];
  const chart = useMemo(() => {
    const values = points.flatMap((p) => p.value === null ? [] : [p.value]);
    const scale = niceScale(0, Math.max(0, ...values), false);
    const x = (i: number) => (points.length <= 1 ? W / 2 : (i / (points.length - 1)) * W);
    const y = (v: number) => H - ((v - scale.min) / (scale.max - scale.min)) * H;
    const segments: [number, number][][] = [[]];
    points.forEach((p, i) => {
      if (p.value === null) segments.push([]);
      else segments[segments.length - 1]?.push([x(i), y(p.value)]);
    });
    return { scale, x, y, current: segments.filter((part) => part.length > 0).map(smoothPath).join(' '), hasValues: values.length > 0 };
  }, [points]);

  const labelEvery = Math.ceil(points.length / (size === "sm" ? 4 : size === "md" ? 5 : 6));
  const focus = active === null ? null : points[active];

  function selectRange(value: DashboardRange) { onRangeChange(value); setActive(null); }
  function inspect(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setActive(Math.round(ratio * (points.length - 1)));
  }
  function onChartKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = points.length - 1;
    setActive((current) => {
      if (event.key === "Home") return 0;
      if (event.key === "End") return last;
      const from = current ?? last;
      return Math.min(last, Math.max(0, from + (event.key === "ArrowRight" ? 1 : -1)));
    });
  }
  function onMetricKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? metrics.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + metrics.length) % metrics.length;
    const selected = metrics[next];
    if (!selected) return;
    setMetricKey(selected.key); setActive(null);
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-metric-index="${next}"]`)?.focus();
  }

  // The tooltip sits in the half of the plot away from the point, so it never covers what it describes.
  const tooltipLeft = focus ? Math.min(88, Math.max(12, (chart.x(active ?? 0) / W) * 100)) : 0;

  return (
    <section ref={rootRef} className={styles.dashboard} data-size={size} aria-label="Marketplace activity">
      <header className={styles.header}>
        <div className={styles.title}>
          <h2>Marketplace activity</h2>
          <p>{description}</p>
        </div>
        <div className={styles.actions}>
          <div className={styles.segmented} role="group" aria-label="Time range">
            {ranges.map((r) => (
              <button key={r.value} type="button" aria-pressed={range === r.value} aria-label={r.long} onClick={() => selectRange(r.value)}>
                {range === r.value && <motion.span layoutId={`${uid}-range`} className={styles.segmentThumb} transition={reduce ? { duration: 0 } : motionTokens.spring.snappy} />}
                <span className={styles.segmentLabel}>{r.label}</span>
              </button>
            ))}
          </div>
          {exportHref && <a className={styles.exportButton} href={exportHref} download><Download size={14} aria-hidden /><span>Export CSV</span></a>}
        </div>
      </header>

      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.kpis} role="tablist" aria-label="Metric">
        {metrics.map((m, index) => {
          const selected = metric.key === m.key;
          return (
            <button key={m.key} type="button" role="tab" id={`${uid}-${m.key}`} aria-controls={`${uid}-chart`} tabIndex={selected ? 0 : -1} data-metric-index={index} onKeyDown={(event) => onMetricKey(event, index)} aria-selected={selected} className={styles.kpi} onClick={() => { setMetricKey(m.key); setActive(null); }}>
              {selected && <motion.span layoutId={`${uid}-kpi`} className={styles.kpiIndicator} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth} />}
              <span className={styles.kpiLabel}>{m.label}</span>
              <span className={styles.kpiValue}>{m.value === null ? "Unavailable" : <CountValue value={m.value} format={formatValue} />}</span>
              <span className={styles.metricDescription}>{m.description}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.chartSection} id={`${uid}-chart`} role="tabpanel" aria-labelledby={`${uid}-${metric.key}`}>
        <div className={styles.chartBar}>
          <div className={styles.legend} aria-hidden>
            <span><i className={styles.swatch} />{metric.label}</span>

          </div>
          <span className={styles.metricDescription}>Daily observations · Perth time</span>
        </div>

        <div className={styles.plot}>
          <div className={styles.yAxis} aria-hidden>
            {[...chart.scale.ticks].reverse().map((t) => <span key={t}>{formatAxis(t)}</span>)}
          </div>
          <div
            className={styles.chartArea}
            tabIndex={0}
            role="img"
            aria-label={`${metric.label}, ${(rangeInfo?.long ?? range).toLowerCase()}. Use arrow keys to inspect values.`}
            onPointerMove={inspect}
            onPointerDown={inspect}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}
            onKeyDown={onChartKey}
            onBlur={() => setActive(null)}
          >
            <div className={styles.grid} aria-hidden>{chart.scale.ticks.map((t) => <span key={t} />)}</div>
              <motion.svg
                className={styles.svg}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                aria-hidden
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduce ? 0 : motionTokens.duration.standard, ease: motionTokens.ease.standard }}
              >
                <path className={styles.line} d={chart.current} />
                {points.map((point, index) => point.value === null ? null : <circle key={point.date} cx={chart.x(index)} cy={chart.y(point.value)} r={2.5} fill="var(--accent)" />)}
              </motion.svg>
            {!chart.hasValues && <p className={styles.empty}>No complete daily observations yet.</p>}
            {focus && (
              <>
                <span className={styles.crosshair} style={{ left: `${(chart.x(active ?? 0) / W) * 100}%` }} aria-hidden />
                {focus.value !== null && <span className={styles.dot} style={{ left: `${(chart.x(active ?? 0) / W) * 100}%`, top: `${(chart.y(focus.value) / H) * 100}%` }} aria-hidden />}
                <div className={styles.tooltip} style={{ left: `clamp(90px, ${tooltipLeft}%, calc(100% - 90px))`, ...(focus.value !== null && chart.y(focus.value) / H < 0.5 ? { top: "auto", bottom: 6 } : null) }} role="status">
                  <span className={styles.tooltipDate}>{formatDay(focus.date)}</span>
                  <strong>{focus.value === null ? "No complete snapshot" : formatValue(focus.value)}</strong>
                </div>
              </>
            )}
          </div>
          <div className={styles.xAxis} aria-hidden>
            {points.map((p, i) => {
              if (i % labelEvery !== 0) return null;
              const pct = (chart.x(i) / W) * 100;
              return <span key={i} style={{ left: `${pct}%`, transform: `translateX(${i === 0 ? 0 : pct > 92 ? -100 : -50}%)` }}>{formatDay(p.date)}</span>;
            })}
          </div>
        </div>
      </div>

    </section>
  );
}

export default MetricsDashboard;
