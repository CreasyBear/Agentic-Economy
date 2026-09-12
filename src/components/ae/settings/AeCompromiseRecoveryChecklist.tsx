import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'

const recoveryChecks = [
  {
    title: 'Review and revoke Clerk sessions',
    description: 'Use Clerk to inspect active sessions, revoke unfamiliar devices, and review factors and recovery methods.',
    href: '#clerk-account-security',
  },
  {
    title: 'Rotate or disconnect Agents',
    description: 'Review each Agent credential generation. Compromise rotation revokes the predecessor immediately.',
    href: '/agent-access',
  },
  {
    title: 'Revoke or reauthorize Provider connections',
    description: 'Review x402 wallet-control authority and its current generation separately from Tool readiness.',
    href: '/owner/operations#provider-connections',
  },
  {
    title: 'Review Provider payout authority',
    description: 'Check the current Stripe-hosted payout destination and readiness before allowing another transfer.',
    href: '/owner/operations#earnings',
  },
  {
    title: 'Retain evidence and contact support',
    description: 'Copy the durable references from Security history. Do not include tokens, signatures, recovery factors, or secrets.',
    href: '/support',
  },
] as const

export function AeCompromiseRecoveryChecklist() {
  return (
    <AeSection
      id="compromise-recovery"
      title="If you suspect compromise"
      description="Containment spans independent systems. Review each source and rely on the state it reports."
    >
      <Alert>
        <AlertTitle>This page does not mark the Account contained</AlertTitle>
        <AlertDescription>
          Resetting MFA alone does not revoke existing sessions, Agent credentials, Provider connection authority, or Provider payout authority.
        </AlertDescription>
      </Alert>
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
    </AeSection>
  )
}
