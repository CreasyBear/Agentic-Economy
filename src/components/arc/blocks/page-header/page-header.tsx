import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import styles from './page-header.module.css'

// Adapted from Arc registry block `page-header`.
// Source TSX SHA-256: cd923838a88769d0282418e0f4fbfb58b0619156ce37e8e0949f0d34b484487c
// Source CSS SHA-256: c35b9522cc9efbc06797c16e8cb7c97f7767f363faa05297754e1f9c8916ca48
export type PageHeaderCrumb = Readonly<{
  id: string
  label: string
  renderLink?: (props: Readonly<{ className: string | undefined; children: ReactNode }>) => ReactNode
}>

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  detail,
}: Readonly<{
  title: string
  description: string
  breadcrumbs: readonly PageHeaderCrumb[]
  actions?: ReactNode
  detail?: ReactNode
}>) {
  return <header className={`arc-market ${styles.root}`}>
    <div className={styles.bar}>
      <div className={styles.lead}>
        {breadcrumbs.length > 0 ? <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((crumb, index) => {
              const current = index === breadcrumbs.length - 1
              const label = crumb.renderLink
                ? crumb.renderLink({
                  className: current ? `${styles.crumb} ${styles.currentLink}` : styles.crumb,
                  children: crumb.label,
                })
                : <span className={current ? styles.current : styles.crumbText} aria-current={current ? 'page' : undefined}>{crumb.label}</span>

              return <li key={crumb.id}>
                {label}
                {current ? null : <ChevronRight className={styles.separator} size={14} strokeWidth={1.75} aria-hidden="true" />}
              </li>
            })}
          </ol>
        </nav> : null}
      </div>
      {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
    </div>

    <div className={styles.introInner}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.details}>
        <p className={styles.description}>{description}</p>
        {detail === undefined ? null : <div className={styles.detail}>{detail}</div>}
      </div>
    </div>
  </header>
}
