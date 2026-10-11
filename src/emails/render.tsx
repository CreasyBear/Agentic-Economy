import { plainTextSelectors, render } from '@react-email/render'
import type { ReactElement } from 'react'

import AccountNotice, { subject as noticeSubject, type NoticeKind, type NoticeProps } from './templates/account-notice'
import AgentApproval, { subject as approvalSubject, type AgentApprovalProps } from './templates/agent-approval'
import FundingReceipt, { subject as fundingSubject, type FundingReceiptProps } from './templates/funding-receipt'
import OperatorDigest, { subject as digestSubject, type OperatorDigestProps } from './templates/operator-digest'
import StalledStepEmail, { subject as stalledSubject, type StalledStep, type StalledStepProps } from './templates/stalled-step'
import StatementReady, { subject as statementSubject, type StatementReadyProps } from './templates/statement-ready'
import UsageAlertEmail, { subject as usageSubject, type UsageAlertKind, type UsageAlertProps } from './templates/usage-alert'

/** The Phase 1 families and the Phase 2 account notices, keyed by eventKind. A switch, not a registry: each kind names its template. */
export type EmailInput =
  | { eventKind: 'agent_approval_requested'; props: AgentApprovalProps }
  | { eventKind: 'stalled_not_funded' | 'stalled_no_agent' | 'stalled_never_called'; props: StalledStepProps }
  | { eventKind: UsageAlertKind; props: UsageAlertProps }
  | { eventKind: 'invoice_ready'; props: StatementReadyProps }
  | { eventKind: 'funding_receipt'; props: FundingReceiptProps }
  | { eventKind: 'operator_digest'; props: OperatorDigestProps }
  | { eventKind: NoticeKind; props: NoticeProps }

export type RenderedEmail = { subject: string; html: string; text: string }

const STALLED_STEP: Record<'stalled_not_funded' | 'stalled_no_agent' | 'stalled_never_called', StalledStep> = {
  stalled_not_funded: 'not_funded',
  stalled_no_agent: 'no_agent',
  stalled_never_called: 'never_called',
}

function build(input: EmailInput): { element: ReactElement; subject: string } {
  switch (input.eventKind) {
    case 'agent_approval_requested':
      return { element: <AgentApproval {...input.props} />, subject: approvalSubject(input.props) }
    case 'stalled_not_funded':
    case 'stalled_no_agent':
    case 'stalled_never_called': {
      const step = STALLED_STEP[input.eventKind]
      return { element: <StalledStepEmail step={step} {...input.props} />, subject: stalledSubject(step) }
    }
    case 'low_credit_balance':
    case 'spend_cap_warning':
    case 'spend_cap_exceeded':
    case 'call_failure_spike':
      return { element: <UsageAlertEmail kind={input.eventKind} {...input.props} />, subject: usageSubject(input.eventKind) }
    case 'invoice_ready':
      return { element: <StatementReady {...input.props} />, subject: statementSubject(input.props) }
    case 'operator_digest':
      return { element: <OperatorDigest {...input.props} />, subject: digestSubject(input.props) }
    case 'funding_receipt':
      return { element: <FundingReceipt {...input.props} />, subject: fundingSubject(input.props) }
    case 'funding_failed':
    case 'task_refunded':
    case 'task_stuck':
    case 'credit_exhausted':
    case 'key_issued':
    case 'key_revoked':
    case 'account_paused':
    case 'account_restored':
    case 'role_changed':
    case 'team_membership_changed':
    case 'email_changed':
    case 'data_request_received':
    case 'welcome':
    case 'provider_live':
    case 'provider_offboarded':
    case 'deletion_requested':
    case 'deletion_completed':
    case 'first_call_done':
    case 'week_one_wrap':
    case 'auto_topup_failed':
    case 'card_changed':
    case 'first_call_failed':
    case 'deletion_cancelled':
    case 'deletion_final_reminder':
      return { element: <AccountNotice kind={input.eventKind} {...input.props} />, subject: noticeSubject(input.eventKind, input.props) }
  }
}

/** html-to-text strips "mailto:" from anchors; keep the href so the text part mirrors every HTML link. */
const PLAIN_TEXT_OPTIONS = {
  selectors: [
    ...plainTextSelectors,
    { selector: 'a[href^="mailto:"]', format: 'mailtoLink' },
  ],
  formatters: {
    mailtoLink: (elem: { children: unknown; attribs?: { href?: string } }, walk: (nodes: unknown, builder: unknown) => void, builder: { addInline: (text: string) => void }) => {
      walk(elem.children, builder)
      builder.addInline(` [${elem.attribs?.href ?? ''}]`)
    },
  },
}

/** One render for the HTML part and one for the plain-text part, so the two never drift from the same element. */
export async function renderEmail(input: EmailInput): Promise<RenderedEmail> {
  const { element, subject } = build(input)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true, htmlToTextOptions: PLAIN_TEXT_OPTIONS })])
  return { subject, html, text }
}
