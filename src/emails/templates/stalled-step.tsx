import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

export type StalledStep = 'not_funded' | 'no_agent' | 'never_called'
export type StalledStepProps = { siteUrl: string; unsubscribeUrl: string }

const STEPS: Record<StalledStep, { subject: string; body: string; label: string; path: string; campaign: string }> = {
  not_funded: {
    subject: 'Add Credit to start using Tools',
    body: 'Your account is set up but has no Credit yet. Add Credit so your Agent can make paid Tool calls.',
    label: 'Add Credit',
    path: '/owner/credit',
    campaign: 'stalled_add_credit',
  },
  no_agent: {
    subject: 'Connect your first Agent',
    body: 'Your account has Credit but no Agent connected yet. Connect an Agent so it can call Tools on your behalf.',
    label: 'Connect an Agent',
    path: '/agent-access',
    campaign: 'stalled_connect_agent',
  },
  never_called: {
    subject: 'Your Agent has not run a Task yet',
    body: 'Your Agent is connected but has not run a Task yet. Browse the market to find a Tool for it to try.',
    label: 'Browse Tools',
    path: '/market',
    campaign: 'stalled_first_call',
  },
}

export const subject = (step: StalledStep) => STEPS[step].subject

export default function StalledStepEmail({ step, siteUrl, unsubscribeUrl }: StalledStepProps & { step: StalledStep }) {
  const copy = STEPS[step]
  return (
    <Layout
      preview={copy.subject}
      siteUrl={siteUrl}
      campaign={copy.campaign}
      unsubscribeUrl={unsubscribeUrl}
      reason="You get this because stalled-step emails are on for your account. Turn them off with the link below."
    >
      <Text className="ae-text" style={bodyText}>{copy.body}</Text>
      <CtaButton href={emailUrl(siteUrl, copy.path, { campaign: copy.campaign, content: 'cta' })}>{copy.label}</CtaButton>
    </Layout>
  )
}

