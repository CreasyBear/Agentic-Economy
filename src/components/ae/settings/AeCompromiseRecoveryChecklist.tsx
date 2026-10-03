import { SettingsGroup } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import buttonStyles from '@/components/arc/button/button.module.css'
import './SecurityHistoryComposition.css'

const recoveryChecks: ReadonlyArray<{
  title: string
  description: string
  href?: string
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
      'Copy durable references from Security history — never tokens, signatures, recovery factors, or secrets.',
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
        <Alert className="arc-security-warning">
          <AlertTitle>This page does not mark the account contained</AlertTitle>
          <AlertDescription>
            Resetting MFA alone does not revoke existing sessions, Agent credentials,
            Provider connection authority.
            <p className="arc-security-financial-impact">
              A$0.00 affected — opening this list does not revoke sessions or Agents.
            </p>
          </AlertDescription>
        </Alert>
        <ol aria-label="Compromise recovery checks" className="arc-security-recovery-list">
          {recoveryChecks.map((check, index) => (
            <li key={check.title} className="arc-security-check">
              <span className="arc-security-check-number" aria-hidden="true">{index + 1}</span>
              <div className="arc-security-check-copy">
                <h3>{check.title}</h3>
                <p>{check.description}</p>
              </div>
              <div className="arc-security-check-action">
                {check.href ? (
                  <a href={check.href} className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-security-review-link`}>
                    {check.href === '/support' ? 'Contact support' : 'Review'}
                  </a>
                ) : <span className="arc-security-review-separately">Review separately</span>}
              </div>
            </li>
          ))}
        </ol>
      </SettingsGroup>
    </div>
  )
}
