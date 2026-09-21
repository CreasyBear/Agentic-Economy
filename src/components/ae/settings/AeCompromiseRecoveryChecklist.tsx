import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AeSettingsRow } from '@/components/ae/layout/AeSection'

const recoveryChecks = [
  {
    title: 'Review and revoke Clerk sessions',
    description: 'In Clerk, revoke unfamiliar devices and review factors and recovery methods.',
    href: '#clerk-account-security',
  },
  {
    title: 'Rotate or disconnect Agents',
    description: 'Review Agent credentials; compromise rotation revokes the predecessor immediately.',
    href: '/agent-access',
  },
  {
    title: 'Revoke or reauthorize Provider connections',
    description: 'Review x402 wallet-control authority and its generation separately from Tool readiness.',
    href: '/owner/operations#provider-connections',
  },
  {
    title: 'Review Provider payout authority',
    description: 'Confirm the Stripe-hosted payout destination and readiness before another transfer.',
    href: '/owner/operations#earnings',
  },
  {
    title: 'Retain evidence and contact support',
    description:
      'Copy durable references from Security history — never tokens, signatures, recovery factors, or secrets.',
    href: '/support',
  },
] as const

export function AeCompromiseRecoveryChecklist() {
  return (
    <details id="compromise-recovery" className="rounded-card border border-border p-gutter">
      <summary
        className="cursor-pointer marker:text-muted-foreground"
        aria-label="If you suspect compromise"
      >
        <span className="ml-intra inline-grid gap-intra align-middle">
          <span className="font-sans text-base font-medium leading-snug tracking-tight text-foreground">If you suspect compromise</span>
          <span className="text-sm font-normal text-muted-foreground">
            Sessions, Agents, Provider connections, and payout authority — reviewing does not change them.
          </span>
        </span>
      </summary>
      <div className="mt-related grid gap-related">
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
                href={check.href}
                action={<Badge variant="secondary">Review at source</Badge>}
              />
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}
