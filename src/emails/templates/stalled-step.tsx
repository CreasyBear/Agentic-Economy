import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

export type StalledStep = 'not_funded' | 'no_agent' | 'never_called'
export type StalledStepProps = { siteUrl: string; unsubscribeUrl: string }

const STEPS: Record<StalledStep, { subject: string; preheader: string; body: string; label: string; path: string; campaign: string }> = {
  not_funded: {
    subject: 'Add credit to start using aecon',
    preheader: 'It takes about a minute.',
    body: 'Your account is set up but has no credit yet. Add credit so your agent can make paid calls.',
    label: 'Add credit',
    path: '/owner/credit',
    campaign: 'stalled_add_credit',
  },
  no_agent: {
    subject: 'Connect your first agent to aecon',
    preheader: 'Your credit is ready to spend.',
    body: 'Your account has credit but no agent connected yet. Connect an agent so it can make calls for you.',
    label: 'Connect an agent',
    path: '/agent-access',
    campaign: 'stalled_connect_agent',
  },
  never_called: {
    subject: 'Your agent is connected. Make a first call',
    preheader: 'Your agent is ready to make its first call.',
    body: 'Your agent is connected but has not made a call yet. Browse the market to find a tool for it to try.',
    label: 'Browse tools',
    path: '/market',
    campaign: 'stalled_first_call',
  },
}

export const subject = (step: StalledStep) => STEPS[step].subject

export default function StalledStepEmail({ step, siteUrl, unsubscribeUrl }: StalledStepProps & { step: StalledStep }) {
  const copy = STEPS[step]
  return (
    <Layout
      preview={copy.preheader}
      siteUrl={siteUrl}
      campaign={copy.campaign}
      unsubscribeUrl={unsubscribeUrl}
      reason="You get this because stalled-step emails are on for your account. Turn them off with the link below."
    >
      {/* Structure from emailcn notification-default (see account-notice.tsx): heading, body, one button. */}
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '28px' }}>{copy.subject}</Text>
      <Text className="ae-text" style={bodyText}>{copy.body}</Text>
      <CtaButton href={emailUrl(siteUrl, copy.path, { campaign: copy.campaign, content: 'cta' })}>{copy.label}</CtaButton>
    </Layout>
  )
}

