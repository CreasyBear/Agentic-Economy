import { Text } from '@react-email/components'

import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

/** Phase 2 notices. All are required transactional mail: no unsubscribe, the footer links to settings. */
export type NoticeKind =
  | 'funding_receipt' | 'funding_failed' | 'task_refunded' | 'task_stuck' | 'credit_exhausted'
  | 'key_issued' | 'key_revoked' | 'account_paused' | 'account_restored'
  | 'role_changed' | 'team_membership_changed' | 'email_changed' | 'data_request_received'

/** Money arrives already formatted by the loader (moneyNoticeAmount), so no amount is retyped here. */
export type NoticeProps = { siteUrl: string; amount?: string; taskRef?: string; role?: string }

type Notice = {
  subject: (props: NoticeProps) => string
  body: (props: NoticeProps) => string
  label: string
  path: string
  campaign: string
}

const NOTICES: Record<NoticeKind, Notice> = {
  funding_receipt: {
    subject: ({ amount }) => `Receipt: ${amount ?? '--'} added as Credit`,
    body: ({ amount }) => `${amount ?? '--'} was added to your Credit. Stripe fees and tax are not part of this amount.`,
    label: 'View receipt', path: '/owner/credit', campaign: 'funding_receipt',
  },
  funding_failed: {
    subject: () => 'Your Credit top-up did not complete',
    body: () => 'Your payment did not go through, so no Credit was added. You can try again from Credit.',
    label: 'Try again', path: '/owner/credit', campaign: 'funding_failed',
  },
  task_refunded: {
    subject: () => 'Refunded: a Task did not complete',
    body: ({ amount, taskRef }) => `Task ${taskRef ?? '--'} did not complete, so ${amount ?? '--'} went back to your Credit, not your card.`,
    label: 'View Task', path: '/owner/operations', campaign: 'task_refunded',
  },
  task_stuck: {
    subject: () => 'A Task is taking longer than usual',
    body: () => 'A Task has been running for over an hour. We are still checking it and will tell you if it is refunded.',
    label: 'See Task', path: '/owner/operations', campaign: 'task_stuck',
  },
  credit_exhausted: {
    subject: () => 'Credit is zero, Tasks will fail',
    body: () => 'Your Credit is at zero, so new Tasks will fail until you add Credit.',
    label: 'Add Credit', path: '/owner/credit', campaign: 'credit_exhausted',
  },
  key_issued: {
    subject: () => 'A new agent key was created',
    body: () => 'A new agent key was created for your account. If you did not create it, revoke it now.',
    label: 'Review keys', path: '/owner/settings/agent', campaign: 'key_issued',
  },
  key_revoked: {
    subject: () => 'An agent key was revoked',
    body: () => 'An agent key on your account was revoked. Agents using that key can no longer make Tool calls.',
    label: 'Review keys', path: '/owner/settings/agent', campaign: 'key_revoked',
  },
  account_paused: {
    subject: () => 'Your aecon account is paused',
    body: () => 'Your aecon account is paused, so Tasks cannot run. See why and what you can do next.',
    label: 'See why', path: '/owner', campaign: 'account_paused',
  },
  account_restored: {
    subject: () => 'Your aecon account is active again',
    body: () => 'Your aecon account is active again. Tasks can run as before.',
    label: 'Open dashboard', path: '/owner', campaign: 'account_restored',
  },
  role_changed: {
    subject: ({ role }) => `Your role is now ${role ?? '--'}`,
    body: ({ role }) => `Your role on this account is now ${role ?? '--'}. Open the workspace to see what that lets you do.`,
    label: 'Open workspace', path: '/owner/workspace', campaign: 'role_changed',
  },
  team_membership_changed: {
    subject: () => 'Team membership changed',
    body: () => 'The team on your account changed. Review who has access.',
    label: 'View team', path: '/owner/settings/team', campaign: 'team_membership',
  },
  email_changed: {
    subject: () => 'Your email address was changed',
    body: () => 'The primary email address on your aecon account was changed. If this was not you, secure your account now.',
    label: 'Secure your account', path: '/owner/settings/account/security', campaign: 'email_changed',
  },
  data_request_received: {
    subject: () => 'We received your data request',
    body: () => 'We have your data request and will email you when it moves forward.',
    label: 'View request', path: '/owner/settings/privacy', campaign: 'data_request',
  },
}

export const subject = (kind: NoticeKind, props: NoticeProps) => NOTICES[kind].subject(props)

export default function AccountNoticeEmail({ kind, ...props }: NoticeProps & { kind: NoticeKind }) {
  const notice = NOTICES[kind]
  return (
    <Layout
      preview={notice.subject(props)}
      siteUrl={props.siteUrl}
      campaign={notice.campaign}
      reason="You get this because of activity on your account. Required account mail cannot be turned off."
    >
      <Text className="ae-text" style={bodyText}>{notice.body(props)}</Text>
      <CtaButton href={emailUrl(props.siteUrl, notice.path, { campaign: notice.campaign, content: 'cta' })}>{notice.label}</CtaButton>
    </Layout>
  )
}
