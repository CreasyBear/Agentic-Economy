'use client'

/* Licensed Arc Pro billing-overview, retrieved 2026-10-02.
 * Adapted from the genuine top, summary and panel regions. AE supplies live
 * credit and funding slots; subscription, card and simulated payment state are removed.
 * Source TSX SHA-256 d7f905c197c0059a7c3a68a485e2def862813a14fc7af857efe4b2ace9113add. */
import { useId, type ReactNode } from 'react'

import styles from './billing-overview.module.css'

export interface BillingOverviewProps {
  balance: Readonly<{
    label: string
    value: string | undefined
    busy: boolean
    content: ReactNode
  }>
  funding: Readonly<{
    label: string
    description: string
    content: ReactNode
  }>
}

export function BillingOverview({ balance, funding }: BillingOverviewProps) {
  const id = useId()
  return <section className={`arc-market ${styles.billing}`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={styles.srOnly}>Account credit</h2>
    <div className={styles.top}>
      <section className={styles.panel} aria-labelledby={`${id}-balance`} aria-busy={balance.busy}>
        <div className={styles.panelHead}><h3 id={`${id}-balance`}>{balance.label}</h3></div>
        {balance.value === undefined ? null : <div className={styles.planLine}>
          <span className={styles.planPrice}>{balance.value}</span>
        </div>}
        <div className={styles.planSummary}><div className={styles.planFacts}>{balance.content}</div></div>
      </section>
      <section className={styles.panel} aria-labelledby={`${id}-funding`}>
        <div className={styles.panelHead}><h3 id={`${id}-funding`}>{funding.label}</h3></div>
        <p className={styles.fundingDescription}>{funding.description}</p>
        {funding.content}
      </section>
    </div>
  </section>
}

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
