import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { formatTimestamp } from '../../lib/ui/format-time'
import { emailUrl } from '../links'

export type UsageAlertKind = 'low_credit_balance' | 'spend_cap_warning' | 'spend_cap_exceeded' | 'call_failure_spike'
/** `body` is the alert text recorded at the usage observation; the loader supplies it, so no amount is retyped here. */
export type UsageAlertProps = { siteUrl: string; body: string; observedAt: string; unsubscribeUrl: string }

const ACTIONS: Record<UsageAlertKind, { subject: string; preheader: string; label: string; path: string; campaign: string }> = {
  low_credit_balance: { subject: 'Your aecon credit is low', preheader: 'Calls pause when your credit runs out.', label: 'Add credit', path: '/owner/credit', campaign: 'low_credit' },
  spend_cap_warning: { subject: 'You are near your spending limit', preheader: 'Calls are held when you reach it.', label: 'Review limit', path: '/owner/settings/spending', campaign: 'spend_cap' },
  spend_cap_exceeded: { subject: 'You reached your spending limit', preheader: 'Calls are held until the limit resets or you raise it.', label: 'Review limit', path: '/owner/settings/spending', campaign: 'spend_cap' },
  call_failure_spike: { subject: 'Calls are failing', preheader: "Check your agent's key and provider status.", label: 'View calls', path: '/owner/operations', campaign: 'call_failure_spike' },
}

export const subject = (kind: UsageAlertKind) => ACTIONS[kind].subject

export default function UsageAlertEmail({ kind, siteUrl, body, observedAt, unsubscribeUrl }: UsageAlertProps & { kind: UsageAlertKind }) {
  const action = ACTIONS[kind]
  const observedText = Number.isNaN(new Date(observedAt).getTime()) ? null : formatTimestamp(observedAt)
  return (
    <Layout
      preview={action.preheader}
      siteUrl={siteUrl}
      campaign={action.campaign}
      unsubscribeUrl={unsubscribeUrl}
      reason="You get this because usage alerts are on for your account. An alert does not create charges or change your authority."
    >
      {/* Structure from emailcn notification-default (see account-notice.tsx): heading, body, one button. */}
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '28px' }}>{action.subject}</Text>
      <Text className="ae-text" style={bodyText}>{body}</Text>
      {observedText === null ? null : <Text className="ae-muted" style={{ ...bodyText, fontSize: 13, lineHeight: '20px' }}>Observed {observedText}</Text>}
      <CtaButton href={emailUrl(siteUrl, action.path, { campaign: action.campaign, content: 'cta' })}>{action.label}</CtaButton>
    </Layout>
  )
}
