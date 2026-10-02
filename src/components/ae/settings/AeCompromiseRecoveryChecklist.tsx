import { SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'

const recoveryChecks: ReadonlyArray<{
  title: string
  description: string
  href?: string
}> = [
  {
    title: 'Review and revoke sessions',
    description: 'Open Profile to revoke unfamiliar devices and review factors and recovery methods.',
    href: '/owner/settings/account',
  },
  {
    title: 'Rotate or disconnect Agents',
    description: 'Review Agent credentials; compromise rotation revokes the predecessor immediately.',
    href: '/owner/settings/agent-keys',
  },
  {
    title: 'Revoke or reauthorize Provider connections',
    description: 'Review wallet-control authority and its generation separately from Tool readiness.',
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
    <SettingsGroup
      title="If you suspect compromise"
      description="Review independent sources. Opening this checklist does not revoke access."
    >
      <Alert className="my-4">
        <AlertTitle>This page does not mark the account contained</AlertTitle>
        <AlertDescription>
          Resetting MFA alone does not revoke existing sessions, Agent credentials,
          Provider connection authority.
          <p className="mt-1 text-xs text-muted-foreground">
            A$0.00 affected — opening this list does not revoke sessions or Agents.
          </p>
        </AlertDescription>
      </Alert>
      <ol aria-label="Compromise recovery checks">
        {recoveryChecks.map((check) => (
          <li key={check.title}>
            <SettingsRow label={check.title} description={check.description}>
              {check.href ? (
                <a href={check.href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  {check.href === '/support' ? 'Contact support' : 'Review'}
                </a>
              ) : <span className="text-muted-foreground">Review separately</span>}
            </SettingsRow>
          </li>
        ))}
      </ol>
    </SettingsGroup>
  )
}
