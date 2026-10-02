/* Arc UI upstream SHA-256: 52486e32ea02ff3a80c20e8010cb3405edf4aa92d5b66e05adcb6172334b0ce9; source retrieved 2026-10-01. */
// Adapted from Arc UI's comparison-table block, retrieved 2026-10-01.
// Keep the authored matrix, responsive peer picker and motion; require real Tool facts.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { motionTokens } from '../lib/motion-tokens'
import styles from './ComparisonTable.module.css'

export type ComparisonColumn = Readonly<{ id: string; name: string; caption: string; action: ReactNode }>
export type ComparisonRow = Readonly<{ id: string; feature: string; hint?: string; values: Readonly<Record<string, string>>; sources?: Readonly<Record<string, string>>; retainWhenSame?: boolean }>
export type ComparisonSection = Readonly<{ id: string; title: string; rows: readonly ComparisonRow[] }>

export function ComparisonTable({ columns, sections, title = 'Find the better fit', description = 'Compare what each Tool contributes. Prices and access stay visible when you show only differences.' }: Readonly<{ columns: readonly ComparisonColumn[]; sections: readonly ComparisonSection[]; title?: string; description?: string }>) {
  const reduced = Boolean(useReducedMotion())
  const uid = useId()
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
  if (!anchor) return <p role="status">Select at least two available Tools to compare.</p>
  const visible = narrow ? columns.filter(column => column.id === anchor.id || column.id === compareWith) : columns
  const differs = (row: ComparisonRow) => new Set(visible.map(column => `${row.values[column.id] ?? 'Not published'}\u0000${row.sources?.[column.id] ?? ''}`)).size > 1
  const gridStyle = { '--columns': visible.length, '--sticky-top': '0px' } as CSSProperties
  return <section ref={rootRef} className={styles.root} data-narrow={narrow || undefined} aria-label="Tool comparison matrix">
    <div className={styles.inner}>
      <header className={styles.header}>
        <div className={styles.intro}>
          <h3 id={`${uid}-title`} className={styles.title}>{title}</h3>
          <p className={styles.description}>{description}</p>
        </div>
        <label className={styles.toggle}>
          <span>Only differences</span>
          <input type="checkbox" role="switch" checked={differencesOnly} onChange={event => setDifferencesOnly(event.target.checked)} />
          <span className={styles.switch} aria-hidden="true"><span className={styles.thumb} /></span>
        </label>
      </header>
      {narrow && others.length > 1 ? <div className={styles.picker} role="group" aria-label={`Compare ${anchor.name} with`}>
        <LayoutGroup id={`${uid}-picker`}>
          {others.map(column => <button key={column.id} type="button" className={styles.pick} aria-pressed={column.id === compareWith} onClick={() => setPeer(column.id)}>
            {column.id === compareWith ? <motion.span layoutId="pick" className={styles.pickHighlight} transition={reduced ? { duration: 0 } : motionTokens.spring.morph} /> : null}
            <span>{column.name}</span>
          </button>)}
        </LayoutGroup>
      </div> : null}
      <div className={styles.scroller}>
        <div role="table" aria-labelledby={`${uid}-title`} className={styles.table} style={gridStyle}>
          <div role="rowgroup" className={styles.head}>
            <div role="row" className={styles.headRow}>
              <div role="columnheader" className={styles.headFeature}><span className={styles.srOnly}>Tool facts</span></div>
              {visible.map(column => <div key={column.id} role="columnheader" className={styles.headCell}>
                <span className={styles.headText}><span className={styles.headName}>{column.name}</span><span className={styles.headCaption}>{column.caption}</span></span>
              </div>)}
            </div>
          </div>
          {sections.map(section => {
            const rows = differencesOnly ? section.rows.filter(row => row.retainWhenSame || differs(row)) : section.rows
            return rows.length === 0 ? null : <div role="rowgroup" key={section.id} className={styles.section}>
              <div role="row" className={styles.sectionRow}><div role="rowheader" className={styles.sectionTitle}>{section.title}</div>{visible.map(column => <div key={column.id} role="cell" className={styles.band} />)}</div>
              {rows.map(row => <div key={row.id} role="row" className={styles.row}>
                <div role="rowheader" className={styles.feature}><span>{row.feature}</span>{row.hint ? <span className={styles.hint}>{row.hint}</span> : null}</div>
                {visible.map(column => <div key={column.id} role="cell" className={styles.cell}><span className={styles.text}>{row.values[column.id] ?? 'Not published'}</span>{row.sources?.[column.id] ? <small className={styles.source}>{row.sources[column.id]}</small> : null}</div>)}
              </div>)}
            </div>
          })}
          <div role="rowgroup"><div role="row" className={styles.footRow}><div role="cell" className={styles.legend}>Inspect the full contract before choosing.</div>{visible.map(column => <div key={column.id} role="cell" className={styles.footCell}>{column.action}</div>)}</div></div>
        </div>
      </div>
      <p className={styles.srOnly} role="status">{differencesOnly ? 'Showing differences and all price, access and source evidence' : 'Showing all Tool facts'}</p>
    </div>
  </section>
}
