import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

export type AgentApprovalProps = { siteUrl: string; agentName: string; expiresMinutes: number }

export const subject = ({ agentName }: AgentApprovalProps) => `${agentName} needs your approval`

export default function AgentApproval({ siteUrl, agentName, expiresMinutes }: AgentApprovalProps) {
  const campaign = 'approval'
  return (
    <Layout
      preview={`${agentName} is waiting for your approval to run a paid Task`}
      siteUrl={siteUrl}
      campaign={campaign}
      reason="You get this because an Agent on your account needs your approval. This is required account mail."
    >
      <Text className="ae-text" style={bodyText}>
        Your Agent &quot;{agentName}&quot; is waiting for your approval to run a paid Task.
      </Text>
      <Text className="ae-text" style={bodyText}>
        Review and approve or decline. This request expires {expiresMinutes} minutes after it was made. If you do nothing, no money moves.
      </Text>
      <CtaButton href={emailUrl(siteUrl, '/agent-access', { campaign, content: 'cta' })}>Review request</CtaButton>
    </Layout>
  )
}

