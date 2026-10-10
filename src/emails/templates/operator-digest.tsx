import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

export type OperatorDigestProps = { siteUrl: string; date: string; lines: string[] }

export const subject = ({ date }: OperatorDigestProps) => `AE stalled accounts, ${date}`

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
      {lines.map((line) => <Text key={line} className="ae-text" style={bodyText}>{line}</Text>)}
      <CtaButton href={emailUrl(siteUrl, '/admin', { campaign, content: 'console' })}>Open console</CtaButton>
    </Layout>
  )
}

