'use client'

/* Licensed Arc Pro usage-billing, retrieved 2026-10-02.
 * Genuine spendHead, MeterRow and invoice table regions, with typed live slots.
 * Monetary strings arrive formatted by AE; only utilization is a number.
 * Demo data, forecasts, saved cards, alert persistence and upgrades are removed.
 * Source TSX SHA-256 0a21e1888b3f0421a1c031803f5578bb5e2cb6b191da970eece9cc57dafb212a. */
import { useId, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

import { motionTokens } from '../../lib/motion-tokens'

import styles from './usage-billing.module.css'

export interface UsageBillingMeterProps {
  summary: ReactNode
  action: ReactNode
  meter: Readonly<{
    name: string
    percent: number | undefined
    valueText: string
    tone: 'ok' | 'warning' | 'critical'
    note: string
    notice: ReactNode
  }> | undefined
}

export function UsageBillingMeter({ summary, action, meter }: UsageBillingMeterProps) {
  const reduce = !!useReducedMotion()
  return <div className={`arc-market ${styles.root}`}><div className={styles.panel}>
    <div className={styles.spendHead}><div className={styles.stat}>{summary}</div>{action}</div>
    {meter === undefined ? null : <ul className={styles.meterList}>
      <li className={styles.meter} data-tone={meter.tone}>
        <div className={styles.meterHead}>
          <span className={styles.meterName}>{meter.tone !== 'ok' && <AlertTriangle size={14} aria-hidden="true" />}{meter.name}</span>
        </div>
        {meter.percent === undefined ? null : <div className={styles.track} role="meter" aria-label={`${meter.percent}% of monthly spending cap used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter.percent} aria-valuetext={meter.valueText}>
          {/* Arc's smooth preset keeps the source meter's no-overshoot behavior,
              so motion never visually exceeds the authoritative utilization. */}
          <motion.span className={styles.used} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: meter.percent / 100 }} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth} />
        </div>}
        <div className={styles.meterFoot}><span className={styles.meterNote}>{meter.note}</span></div>
        {meter.notice}
      </li>
    </ul>}
  </div></div>
}

export interface UsageBillingInvoice {
  id: string
  anchorId: string
  description: string
  date: string
  amount: string
  status: Readonly<{ label: string; tone: 'paid' | 'reversed' }>
  detail: ReactNode
  actions: ReactNode
}

export interface UsageBillingInvoicesProps {
  title: string
  description: string
  invoices: readonly UsageBillingInvoice[]
  state: ReactNode
  continuation: ReactNode
}

export function UsageBillingInvoices({ title, description, invoices, state, continuation }: UsageBillingInvoicesProps) {
  const id = useId()
  return <div className={`arc-market ${styles.root}`}><section className={styles.panel} aria-labelledby={`${id}-invoices`}>
    <div className={styles.panelHead}><div><h3 id={`${id}-invoices`}>{title}</h3><p className={styles.muted}>{description}</p></div></div>
    {state}
    {invoices.length === 0 ? null : <div className={styles.tableFrame}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Top-up</th><th scope="col" className={styles.issued}>Date</th><th scope="col" className={styles.num}>Amount</th><th scope="col">Status</th><th scope="col"><span className={styles.srOnly}>Documents</span></th></tr></thead>
        <tbody>{invoices.map(invoice => <tr key={invoice.id} id={invoice.anchorId} className={styles.invoiceRow}>
          <td><span className={styles.invoiceName}>{invoice.description}</span><div className={styles.invoiceDetail}>{invoice.detail}</div></td>
          <td className={styles.issued}>{invoice.date}</td>
          <td className={styles.num}>{invoice.amount}</td>
          <td><span className={styles.status} data-status={invoice.status.tone}>{invoice.status.label}</span></td>
          <td className={styles.action}>{invoice.actions}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {continuation}
  </section></div>
}
