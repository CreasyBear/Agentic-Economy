'use client'

/* Licensed Arc Pro billing-overview, retrieved 2026-10-02.
 * Retained history panel region for live AE records. Credit funding uses ReUI
 * Profile 8; obsolete top and balance regions have been removed.
 * Source TSX SHA-256 d7f905c197c0059a7c3a68a485e2def862813a14fc7af857efe4b2ace9113add. */
import { useId, type ReactNode } from 'react'

import styles from './billing-overview.module.css'

export function BillingHistory({ title, description, children }: Readonly<{
  title: string
  description: string
  children: ReactNode
}>) {
  const id = useId()
  return <section className={`arc-market ${styles.billing}`} aria-labelledby={`${id}-history`}>
    <div className={`${styles.panel} ${styles.history}`}>
      <div className={styles.panelHead}><h3 id={`${id}-history`}>{title}</h3></div>
      <p className={styles.fundingDescription}>{description}</p>
      {children}
    </div>
  </section>
}
