import { Column, Link, Row, Section, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'

import { amountFromParts } from '@/modules/money/public'

import { EMAIL_COLORS, EMAIL_LEGAL_LINES } from '../brand'
import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'
import { formatMoney } from '../money'
import { formatTimestamp } from '../../lib/ui/format-time'

/** Units come straight from the funding command (design doc 6.1); nothing is recomputed here. `exponent` is the command's AUD exponent, minor units (2) when omitted. */
export type FundingReceiptProps = {
  siteUrl: string
  principalUnits: string
  serviceFeeUnits: string
  taxUnits: string
  totalUnits: string
  exponent?: number
  /** `AE-####`, the ledger receipt id. */
  invoiceNumber?: string
  /** Funding confirmation time. */
  confirmedAt?: string
  timeZone?: string
  buyerName?: string
  buyerEmail?: string
  /** Preferred over name and email on the buyer line when the account has one. */
  buyerAbn?: string
}

/** A$1,000 buyer rule, compared as exact integer units at the exponent. */
const BUYER_THRESHOLD_AUD = 1000n
const SUPPLIER_LINE = EMAIL_LEGAL_LINES[0] ?? ''

export const subject = () => 'Tax invoice for your aecon top-up'

const row: CSSProperties = { ...bodyText, fontSize: 14, lineHeight: '20px', margin: 0, padding: '8px 0', borderBottom: `1px solid ${EMAIL_COLORS.light.border}` }
const muted: CSSProperties = { color: EMAIL_COLORS.light.muted }

function Line({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  const weight = strong ? { fontWeight: 500 } : {}
  return (
    <Row>
      <Column className="ae-muted" style={{ ...row, ...muted, width: '45%' }}>{label}</Column>
      <Column className="ae-text" align="right" style={{ ...row, ...weight, textAlign: 'right' }}>{children}</Column>
    </Row>
  )
}

function zoneLabel(at: string, timeZone: string | undefined): string {
  const part = new Intl.DateTimeFormat('en-AU', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(at)).find((p) => p.type === 'timeZoneName')
  return part?.value ?? ''
}

export default function FundingReceiptEmail({
  siteUrl, principalUnits, serviceFeeUnits, taxUnits, totalUnits, exponent = 2,
  invoiceNumber, confirmedAt, timeZone, buyerName, buyerEmail, buyerAbn,
}: FundingReceiptProps) {
  const money = (units: string) => formatMoney(amountFromParts('AUD', units, exponent))
  const total = money(totalUnits)
  const needsBuyer = BigInt(totalUnits) >= BUYER_THRESHOLD_AUD * 10n ** BigInt(exponent)
  const buyer = buyerAbn !== undefined ? `ABN ${buyerAbn}` : [buyerName, buyerEmail].filter(Boolean).join(', ')
  const campaign = 'funding_receipt'
  return (
    <Layout
      preview={`${total} paid. ${money(taxUnits)} of it is GST.`}
      siteUrl={siteUrl}
      campaign={campaign}
      reason="You get this because you added credit to your aecon account. It is your record of the purchase."
      showSettings
    >
      {/* Structure from emailcn receipt-default (see layout.tsx): title, reference line, rows, divider, total, one button. */}
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '28px', margin: '0 0 4px' }}>Tax invoice</Text>
      <Text className="ae-muted" style={{ ...bodyText, ...muted, margin: '0 0 16px' }}>
        {[invoiceNumber, confirmedAt === undefined ? undefined : `${formatTimestamp(confirmedAt, timeZone)} ${zoneLabel(confirmedAt, timeZone)}`.trim()].filter(Boolean).join(' | ')}
      </Text>
      <Text className="ae-text" style={{ ...bodyText, fontSize: 14, lineHeight: '20px' }}>{SUPPLIER_LINE}</Text>
      {needsBuyer || buyer !== '' ? (
        <Text className="ae-text" style={{ ...bodyText, fontSize: 14, lineHeight: '20px' }}>
          Billed to: {needsBuyer ? buyer : buyerEmail}
        </Text>
      ) : null}
      <Section style={{ margin: '0 0 16px' }}>
        <Line label="Description">aecon credit</Line>
        <Line label="Credit amount">{money(principalUnits)}</Line>
        <Line label="Service fee">{money(serviceFeeUnits)}</Line>
        <Line label="GST">{money(taxUnits)}</Line>
        <Line label="Total paid" strong>{total}</Line>
      </Section>
      <Text className="ae-muted" style={{ ...bodyText, ...muted, fontSize: 13, lineHeight: '20px' }}>
        Questions about this invoice? Email <Link href="mailto:support@aecon.ai" className="ae-link" style={{ color: EMAIL_COLORS.light.text }}>support@aecon.ai</Link>.
      </Text>
      <CtaButton href={emailUrl(siteUrl, '/owner/credit', { campaign, content: 'cta' })}>View credit</CtaButton>
    </Layout>
  )
}
