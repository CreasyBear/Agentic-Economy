import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

/** Phase 2 and 3 notices. All are required transactional mail: no unsubscribe, the footer links to settings. */
export type NoticeKind =
  | 'funding_receipt' | 'funding_failed' | 'task_refunded' | 'task_stuck' | 'credit_exhausted'
  | 'key_issued' | 'key_revoked' | 'account_paused' | 'account_restored'
  | 'role_changed' | 'team_membership_changed' | 'email_changed' | 'data_request_received'
  | 'welcome' | 'provider_live' | 'provider_offboarded'

/** Money arrives already formatted by the loader (moneyNoticeAmount), so no amount is retyped here. */
export type NoticeProps = { siteUrl: string; amount?: string; taskRef?: string; role?: string; toolRef?: string }

type Notice = {
  subject: (props: NoticeProps) => string
  /** Adds what the subject could not fit. Never repeats it. */
  preheader: (props: NoticeProps) => string
  body: (props: NoticeProps) => string
  label: string
  path: string | ((props: NoticeProps) => string)
  campaign: string
}

const money = (amount: string | undefined) => amount ?? '--'

const NOTICES: Record<NoticeKind, Notice> = {
  funding_receipt: {
    subject: ({ amount }) => `Receipt for your ${money(amount)} aecon top-up`,
    preheader: ({ amount }) => `${money(amount)} credit added.`,
    body: ({ amount }) => `${money(amount)} was added to your aecon credit. Fees and tax are not part of this amount.`,
    label: 'View receipt', path: '/owner/credit', campaign: 'funding_receipt',
  },
  funding_failed: {
    subject: ({ amount }) => (amount === undefined ? "Your top-up didn't go through" : `Your ${amount} top-up didn't go through`),
    preheader: () => 'Try again or use another card.',
    body: () => "Your payment didn't go through, so no credit was added. You can try again or use another card.",
    label: 'Try again', path: '/owner/credit', campaign: 'funding_failed',
  },
  task_refunded: {
    subject: ({ amount }) => `Refunded ${money(amount)} for a failed call`,
    preheader: ({ taskRef }) => `Call ${taskRef ?? '--'}.`,
    body: ({ amount, taskRef }) => `Call ${taskRef ?? '--'} did not complete, so ${money(amount)} went back to your aecon credit, not your card.`,
    label: 'View receipt', path: '/owner/operations', campaign: 'task_refunded',
  },
  task_stuck: {
    subject: () => "We're still confirming a payment",
    preheader: () => 'Check the receipt before paying again.',
    body: () => "A call has been running for over an hour. We're still checking it and will tell you if it is refunded.",
    label: 'View receipt', path: '/owner/operations', campaign: 'task_stuck',
  },
  credit_exhausted: {
    subject: () => 'Your aecon credit has run out',
    preheader: () => 'Calls are paused until you add credit.',
    body: () => 'Your credit is at A$0.00, so new calls will fail until you add credit.',
    label: 'Add credit', path: '/owner/credit', campaign: 'credit_exhausted',
  },
  key_issued: {
    subject: () => 'A new aecon key was created',
    preheader: () => "If this wasn't you, revoke the key now.",
    body: () => "A new agent key was created on your account. If this wasn't you, revoke it now or contact support@aecon.ai.",
    label: 'Review keys', path: '/owner/settings/agent', campaign: 'key_issued',
  },
  key_revoked: {
    subject: () => 'An aecon key was revoked',
    preheader: () => 'Agents using it can no longer make calls.',
    body: () => 'An agent key on your account was revoked. Agents using that key can no longer make calls.',
    label: 'Review keys', path: '/owner/settings/agent', campaign: 'key_revoked',
  },
  account_paused: {
    subject: () => 'Your aecon account is paused',
    preheader: () => 'Calls are on hold. Here is why.',
    body: () => 'Your aecon account is paused, so calls cannot run. See why and what to do next.',
    label: 'View account', path: '/owner', campaign: 'account_paused',
  },
  account_restored: {
    subject: () => 'Your aecon account is back on',
    preheader: () => 'Calls work again.',
    body: () => 'Your aecon account is active again. Calls run as before.',
    label: 'View account', path: '/owner', campaign: 'account_restored',
  },
  role_changed: {
    subject: ({ role }) => `Your role is now ${role ?? '--'}`,
    preheader: () => 'See what that lets you do.',
    body: ({ role }) => `Your role on this aecon account is now ${role ?? '--'}. Open the workspace to see what that lets you do.`,
    label: 'Open workspace', path: '/owner/workspace', campaign: 'role_changed',
  },
  team_membership_changed: {
    subject: () => 'Your aecon team changed',
    preheader: () => 'Review who has access.',
    body: () => 'The team on your aecon account changed. Review who has access.',
    label: 'Review team', path: '/owner/settings/team', campaign: 'team_membership',
  },
  email_changed: {
    subject: () => 'Your aecon email changed',
    preheader: () => "If this wasn't you, contact support@aecon.ai.",
    body: () => "The primary email address on your aecon account was changed. If this wasn't you, contact support@aecon.ai.",
    label: 'Contact support', path: '/owner/settings/account/security', campaign: 'email_changed',
  },
  welcome: {
    subject: () => 'Welcome to aecon. Add credit to start',
    preheader: () => 'You only pay per call.',
    body: () => 'Your account is ready. Add credit to make your first call. You only pay per call.',
    label: 'Add credit', path: '/owner/credit', campaign: 'welcome',
  },
  provider_live: {
    subject: () => 'Your service is live on aecon',
    preheader: () => 'Agents can now find and call it.',
    body: () => 'Your service is listed and open to agents.',
    label: 'View provider page', path: ({ toolRef }) => `/owner/operations/${encodeURIComponent(toolRef ?? '')}`, campaign: 'provider_live',
  },
  provider_offboarded: {
    subject: () => 'Your service was removed from aecon',
    preheader: () => 'Your final statement is ready.',
    body: () => 'Your provider account is closed and your services are no longer listed. Your final statement is available in receipts.',
    label: 'View details', path: '/owner/settings/receipts', campaign: 'provider_offboarded',
  },
  data_request_received: {
    subject: () => 'We received your data request',
    preheader: () => "We'll email you when it moves forward.",
    body: () => "We have your data request and will email you when it moves forward.",
    label: 'View request', path: '/owner/settings/privacy', campaign: 'data_request',
  },
}

export const subject = (kind: NoticeKind, props: NoticeProps) => NOTICES[kind].subject(props)

export default function AccountNoticeEmail({ kind, ...props }: NoticeProps & { kind: NoticeKind }) {
  const notice = NOTICES[kind]
  return (
    <Layout
      preview={notice.preheader(props)}
      siteUrl={props.siteUrl}
      campaign={notice.campaign}
      reason="You get this because of activity on your account. Required account mail cannot be turned off."
    >
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '30px' }}>{notice.subject(props)}</Text>
      <Text className="ae-text" style={bodyText}>{notice.body(props)}</Text>
      <CtaButton href={emailUrl(props.siteUrl, typeof notice.path === 'string' ? notice.path : notice.path(props), { campaign: notice.campaign, content: 'cta' })}>{notice.label}</CtaButton>
    </Layout>
  )
}
