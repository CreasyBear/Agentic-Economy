import { useId, type CSSProperties } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import styles from './comparison-table.module.css'
import { useAeComparisonTable } from './useAeComparisonTable'
import type { AeComparisonTableProps, ComparisonRow } from './comparison-table.contracts'

export function AeComparisonTable({ columns, sections, title = 'Find the better fit', description = 'Compare what each Tool contributes. Prices and access stay visible when you show only differences.' }: AeComparisonTableProps) {
  const reduced = Boolean(useReducedMotion())
  const uid = useId()
  const { rootRef, narrow, differencesOnly, setDifferencesOnly, compareWith, setCompareWith, anchor, others, visible } = useAeComparisonTable(columns)
  if (!anchor) return <p role="status">Select at least two available Tools to compare.</p>
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
          {others.map(column => <button key={column.id} type="button" className={styles.pick} aria-pressed={column.id === compareWith} onClick={() => setCompareWith(column.id)}>
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
