import { Column, Row, Section, Text } from '@react-email/components'
import type { CSSProperties } from 'react'

import type { ExactAmount } from '@/modules/money/public'

import { EMAIL_COLORS } from '../brand'
import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'
import { formatMoney } from '../money'
import { formatCount, formatTimestamp } from '../../lib/ui/format-time'

/** One ledger row of the month. Amounts arrive as ledger ExactAmount and print through the money formatter. */
export type StatementRow = { id: string; at?: string; provider?: string; product?: string; total?: ExactAmount }
export type StatementReadyProps = { siteUrl: string; periodLabel: string; rows: StatementRow[]; total?: ExactAmount; timeZone?: string }

/** Statements over this many rows show the first rows and a count line (design doc 6.2). */
export const STATEMENT_ROW_CAP = 25

export const subject = ({ periodLabel }: StatementReadyProps) => `Your aecon statement for ${periodLabel}`

const cell: CSSProperties = { ...bodyText, fontSize: 14, lineHeight: '20px', margin: 0, padding: '8px 0', borderBottom: `1px solid ${EMAIL_COLORS.light.border}` }

export default function StatementReadyEmail({ siteUrl, periodLabel, rows, total, timeZone }: StatementReadyProps) {
  // Zero calls in the month means no statement is sent (design doc P8); the loader skips, so reaching here is a bug.
  if (rows.length === 0) throw new Error('statement_no_calls')
  const campaign = 'statement_ready'
  const shown = rows.slice(0, STATEMENT_ROW_CAP)
  const more = rows.length - shown.length
  const calls = `${formatCount(rows.length)} ${rows.length === 1 ? 'call' : 'calls'}`
  return (
    <Layout
      preview={`${formatMoney(total)} across ${calls}.`}
      siteUrl={siteUrl}
      campaign={campaign}
      reason="You get this because statement emails are on for your account. Change this in notification settings."
    >
      {/* Structure from emailcn order-summary-table (see layout.tsx): heading, lead, rows, total, one button. */}
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '28px' }}>Statement for {periodLabel}</Text>
      <Text className="ae-text" style={bodyText}>{formatMoney(total)} across {calls}.</Text>
      <Section style={{ margin: '0 0 16px' }}>
        {shown.map((row) => (
          <Row key={row.id}>
            <Column className="ae-text" style={{ ...cell, width: '60%' }}>
              {[row.product, row.provider].filter(Boolean).join(', ') || row.id}
              {row.at === undefined ? null : <span className="ae-muted" style={{ color: EMAIL_COLORS.light.muted }}><br />{formatTimestamp(row.at, timeZone)}</span>}
            </Column>
            <Column className="ae-text" align="right" style={{ ...cell, textAlign: 'right' }}>{formatMoney(row.total)}</Column>
          </Row>
        ))}
        {more > 0 ? (
          <Row>
            <Column className="ae-muted" colSpan={2} style={{ ...cell, color: EMAIL_COLORS.light.muted }}>{formatCount(more)} more {more === 1 ? 'call' : 'calls'}</Column>
          </Row>
        ) : null}
        <Row>
          <Column className="ae-text" style={{ ...cell, fontWeight: 500, borderBottom: 'none' }}>Total</Column>
          <Column className="ae-text" align="right" style={{ ...cell, fontWeight: 500, textAlign: 'right', borderBottom: 'none' }}>{formatMoney(total)}</Column>
        </Row>
      </Section>
      <CtaButton href={emailUrl(siteUrl, '/owner/credit', { campaign, content: 'cta' })}>View statement</CtaButton>
    </Layout>
  )
}
