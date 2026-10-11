import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

export type AgentApprovalProps = { siteUrl: string; agentName: string; expiresMinutes: number }

export const subject = ({ agentName }: AgentApprovalProps) => `${agentName} needs your approval`

export default function AgentApproval({ siteUrl, agentName, expiresMinutes }: AgentApprovalProps) {
  const campaign = 'approval'
  return (
    <Layout
      preview={`Approve or decline within ${expiresMinutes} minutes.`}
      siteUrl={siteUrl}
      campaign={campaign}
      reason="You get this because an agent on your account needs your approval. Required account mail cannot be turned off."
    >
      {/* Structure from emailcn notification-default (see account-notice.tsx): heading, body, one button. */}
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '28px' }}>{subject({ siteUrl, agentName, expiresMinutes })}</Text>
      <Text className="ae-text" style={bodyText}>
        {agentName} is waiting for your approval to run a paid call. The request expires in {expiresMinutes} minutes. If you do nothing, no money moves.
      </Text>
      <CtaButton href={emailUrl(siteUrl, '/agent-access', { campaign, content: 'cta' })}>Review request</CtaButton>
    </Layout>
  )
}
