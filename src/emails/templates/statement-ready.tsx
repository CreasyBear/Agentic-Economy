import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

export type StatementReadyProps = { siteUrl: string; periodLabel: string }

export const subject = ({ periodLabel }: StatementReadyProps) => `Your ${periodLabel} statement is ready`

export default function StatementReadyEmail({ siteUrl, periodLabel }: StatementReadyProps) {
  const campaign = 'statement_ready'
  return (
    <Layout
      preview={`Your statement for ${periodLabel} is ready to download`}
      siteUrl={siteUrl}
      campaign={campaign}
      reason="You get this because statement emails are on for your account. Change this in notification settings."
    >
      <Text className="ae-text" style={bodyText}>Your statement for {periodLabel} is ready to download.</Text>
      <CtaButton href={emailUrl(siteUrl, '/owner/credit', { campaign, content: 'cta' })}>Download statement</CtaButton>
    </Layout>
  )
}

