import { Column, Row, Section, Text } from '@react-email/components'

import { EMAIL_COLORS } from '../brand'
import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

export type OperatorDigestProps = { siteUrl: string; date: string; lines: string[] }

export const subject = ({ date }: OperatorDigestProps) => `aecon stalled accounts, ${date}`

export default function OperatorDigestEmail({ siteUrl, date, lines }: OperatorDigestProps) {
  const campaign = 'operator_digest'
  return (
    <Layout
      preview={`Stalled accounts for ${date}`}
      siteUrl={siteUrl}
      campaign={campaign}
      reason="You get this because you are on the operator list. Operator mail has no settings link."
      showSettings={false}
    >
      {/* Structure from emailcn notification-default (see account-notice.tsx): heading, body, one button; the list is a row per line. */}
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '28px' }}>Stalled accounts, {date}</Text>
      <Section style={{ margin: '0 0 8px' }}>
        {lines.map((line) => (
          <Row key={line}>
            <Column className="ae-text" style={{ ...bodyText, margin: 0, padding: '8px 0', borderBottom: `1px solid ${EMAIL_COLORS.light.border}` }}>{line}</Column>
          </Row>
        ))}
      </Section>
      <CtaButton href={emailUrl(siteUrl, '/admin', { campaign, content: 'console' })}>Open console</CtaButton>
    </Layout>
  )
}
