import { SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './SecurityHistoryComposition.css'

const recoveryChecks: ReadonlyArray<{
  title: string
  description: string
  href: string
}> = [
  {
    title: 'Review and revoke sessions',
    description: 'Open Security to revoke unfamiliar devices and review factors and recovery methods.',
    href: '/owner/settings/account/security',
  },
  {
    title: 'Rotate or disconnect Agents',
    description: 'Review Agent credentials; compromise rotation revokes the predecessor immediately.',
    href: '/owner/settings/agent-keys',
  },
  {
    title: 'Revoke or reauthorize Provider connections',
    description: 'Review wallet-control authority and its generation separately from Tool readiness.',
    href: '/owner/settings/integrations',
  },
  {
    title: 'Retain evidence and contact support',
    description:
      'Copy durable references from Security history. Never tokens, signatures, recovery factors, or secrets.',
    href: '/support',
  },
]

export function AeCompromiseRecoveryChecklist() {
  return (
    <div className="arc-market arc-security-recovery">
      <SettingsGroup
        title="If you suspect compromise"
        description="Review independent sources. Opening this checklist does not revoke access."
      >
        <AeAlert role="alert" tone="warning" title="This page does not mark the account contained" className="arc-security-warning">
            Resetting MFA alone does not revoke existing sessions, Agent credentials,
            Provider connection authority.
            <p className="arc-security-financial-impact">
              A$0.00 affected. Opening this list does not revoke sessions or Agents.
            </p>
          </AeAlert>
        {recoveryChecks.map((check) => (
          <SettingsRow key={check.title} label={check.title} description={check.description}>
            <a href={check.href} className={`${actionLinkClassName('secondary', 'md')} arc-security-review-link`}>
              {check.href === '/support' ? 'Contact support' : 'Review'}
            </a>
          </SettingsRow>
        ))}
      </SettingsGroup>
    </div>
  )
}
