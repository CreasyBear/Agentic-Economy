"use client";

/* Licensed Arc Pro ApiKeys block. Header, list trigger, disclosed facts and
 * revoke region retained; real creation/reveal are owned by the supplied handler.
 * Demo secret generation, usage, scopes and optimistic revocation are omitted. */
import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '../../../../arc/button/button'
import styles from './api-keys.module.css'

export type ApiKeyRecord = Readonly<{
  id: string; name: string; environmentLabel: string; statusLabel: string
  active: boolean; current: boolean; issuedLabel: string; expiresLabel: string
  generation: number; credentialReference: string
  onRequestRevoke: (trigger: HTMLButtonElement) => void
  renderAgentLink: (props: { className: string | undefined; children: ReactNode }) => ReactNode
}>

export type ApiKeysProps = Readonly<{
  rows: readonly ApiKeyRecord[]
  issueDisabled: boolean; revokeDisabled: boolean; onIssue: () => void
  loadMore?: Readonly<{ pending: boolean; onLoad: () => void }>
}>

// Requires authoritative credential projections and caller-owned mutation locks.
// Ensures one record per key; opening details has no external effects.
// Invariant: no secrets, optimistic revocations or historical-key revoke controls.
// On pending or uncertain readback, retain facts and disable changes until refresh.
export function ApiKeys({ rows, issueDisabled, revokeDisabled, onIssue, loadMore }: ApiKeysProps) {
  const id = useId()
  return <section className={`arc-market ${styles.block}`} aria-labelledby={`${id}-title`}>
    <div className={styles.top}>
      <header className={styles.header}>
        <h3 id={`${id}-title`}>Issued keys</h3>
        <p>Open a key to inspect its credential history or revoke access. Secrets are shown only once when issued.</p>
      </header>
      <div className={styles.toolbar}>
        <p className={styles.count}>{rows.filter(row => row.active).length} active · {rows.length} shown</p>
        <Button type="button" variant="primary" disabled={issueDisabled} onClick={onIssue}>Issue Agent key</Button>
      </div>
    </div>
    {rows.length === 0 ? <div className={styles.empty}>
      <h4>No Agent keys yet</h4><p>Issue a key to connect your first Agent.</p>
    </div> : <ul className={styles.list} aria-label="Issued Agent keys">
      {rows.map(item => <li key={item.id} className={styles.row}>
        <details className={styles.rowInner}>
          <summary id={`${id}-${item.id}`} className={styles.trigger} aria-label={`Key details for ${item.name}, ${item.environmentLabel}, generation ${item.generation}`}>
            <span className={styles.identity}>
              <span className={styles.nameLine}><span className={styles.name}>{item.name}</span><span className={styles.env}>{item.environmentLabel}</span></span>
              <span className={styles.created}>Created {item.issuedLabel}</span>
            </span>
            <span className={styles.dates}>Expires {item.expiresLabel}</span>
            <span className={styles.state} data-active={item.active || undefined}>{item.statusLabel}</span>
            <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
          </summary>
          <div className={styles.detail} role="region" aria-labelledby={`${id}-${item.id}`}>
            <div className={styles.detailInner}>
              <dl className={styles.facts}>
                <div><dt>Credential reference</dt><dd><code>{item.credentialReference}</code></dd></div>
                <div><dt>Generation</dt><dd>{item.generation}</dd></div>
                <div><dt>Issued</dt><dd>{item.issuedLabel}</dd></div>
                <div><dt>Expires</dt><dd>{item.expiresLabel}</dd></div>
              </dl>
              <div className={styles.revokeRow}>
                <p className={styles.revokeNote}>{item.active
                  ? <>Revoking this key stops new requests made with it. The Agent and its activity history remain.{item.current ? ' If no other key is active the Agent must reconnect.' : ''}</>
                  : <>This key is {item.statusLabel.toLowerCase()}. The Agent and its activity history remain.</>}</p>
                <div className={styles.actions}>
                  {item.renderAgentLink({ className: styles.link, children: 'View Agent' })}
                  {item.active ? <Button type="button" variant="danger" disabled={revokeDisabled} aria-label={`Revoke key created ${item.issuedLabel} for ${item.name}`} onClick={event => item.onRequestRevoke(event.currentTarget)}>Revoke key</Button> : null}
                </div>
              </div>
            </div>
          </div>
        </details>
      </li>)}
    </ul>}
    {loadMore ? <footer className={styles.footer}>
      <Button type="button" variant="secondary" disabled={loadMore.pending} onClick={loadMore.onLoad}>{loadMore.pending ? 'Loading…' : 'Load more keys'}</Button>
    </footer> : null}
  </section>
}

export default ApiKeys
