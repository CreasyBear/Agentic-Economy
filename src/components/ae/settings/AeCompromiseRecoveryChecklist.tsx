import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

const recoveryChecks: ReadonlyArray<{
  title: string
  description: string
  href?: string
}> = [
  {
    title: 'Review and revoke sessions',
    description: 'Open Profile to revoke unfamiliar devices and review factors and recovery methods.',
  },
  {
    title: 'Rotate or disconnect Agents',
    description: 'Review Agent credentials; compromise rotation revokes the predecessor immediately.',
  },
  {
    title: 'Revoke or reauthorize Provider connections',
    description: 'Review wallet-control authority and its generation separately from Tool readiness.',
  },
  {
    title: 'Review Provider payout authority',
    description: 'Confirm the Stripe-hosted payout destination and readiness before another transfer.',
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
    <AeSection
      id="compromise-recovery"
      title="If you suspect compromise"
      description="Sessions, Agents, Provider connections, and payout authority — reviewing does not change them."
    >
      <div className="grid gap-related">
        <Alert>
          <AlertTitle>This page does not mark the Account contained</AlertTitle>
          <AlertDescription>
            Resetting MFA alone does not revoke existing sessions, Agent credentials, Provider connection authority, or Provider payout authority.
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              A$0.00 affected — opening this list does not revoke sessions, Agents, or payouts.
            </p>
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">Containment spans independent systems. Review each source and rely on the state it reports.</p>
        <ol className="grid gap-intra" aria-label="Compromise recovery checks">
          {recoveryChecks.map((check) => (
            <li key={check.title}>
              <AeSettingsRow
                title={check.title}
                description={check.description}
                {...(check.href === undefined ? {} : { href: check.href })}
                action={<Badge variant="secondary">Review at source</Badge>}
              />
            </li>
          ))}
        </ol>
      </div>
    </AeSection>
  )
}
