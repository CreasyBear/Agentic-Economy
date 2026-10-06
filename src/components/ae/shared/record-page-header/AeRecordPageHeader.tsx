import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

import styles from './record-page-header.module.css'
import type { AeRecordPageHeaderProps, RecordPageHeaderCrumb } from './record-page-header.contracts'

function renderCrumb(crumb: RecordPageHeaderCrumb, index: number, breadcrumbs: readonly RecordPageHeaderCrumb[]) {
  const current = index === breadcrumbs.length - 1
  const className = current ? `${styles.crumb} ${styles.currentLink}` : styles.crumb
  const label: ReactNode = crumb.renderLink
    ? crumb.renderLink({ className, children: crumb.label })
    : <span className={current ? styles.current : styles.crumbText} aria-current={current ? 'page' : undefined}>{crumb.label}</span>

  return <li key={crumb.id}>
    {label}
    {current ? null : <ChevronRight className={styles.separator} size={14} strokeWidth={1.75} aria-hidden="true" />}
  </li>
}

export function AeRecordPageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  detail,
  className,
  titleId,
  descriptionId,
  titleTabIndex,
  context,
  metadata,
}: AeRecordPageHeaderProps) {
  const hasBarContent = breadcrumbs.length > 0
    || context !== undefined
    || metadata !== undefined
    || actions !== undefined

  return <header className={['arc-market', styles.root, className].filter(Boolean).join(' ')}>
    {hasBarContent ? <div className={styles.bar}>
      <div className={styles.lead}>
        {breadcrumbs.length > 0 ? <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((crumb, index) => renderCrumb(crumb, index, breadcrumbs))}
          </ol>
        </nav> : null}
        {context === undefined ? null : <div className={styles.context}>{context}</div>}
      </div>
      {metadata === undefined && actions === undefined ? null : <div className={styles.actions}>
        {metadata === undefined ? null : <div className={styles.metadata}>{metadata}</div>}
        {actions}
      </div>}
    </div> : null}
    <div className={styles.introInner}>
      <h1 id={titleId} tabIndex={titleTabIndex} className={styles.title}>{title}</h1>
      <div className={styles.details}>
        <p id={descriptionId} className={styles.description}>{description}</p>
        {detail === undefined ? null : <div className={styles.detail}>{detail}</div>}
      </div>
    </div>
  </header>
}
