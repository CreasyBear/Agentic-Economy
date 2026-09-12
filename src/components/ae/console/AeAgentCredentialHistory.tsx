import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/ui/format-time'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'

export function AeAgentCredentialHistory({
  detail,
  lifecyclePending,
  onRequestRevoke,
}: Readonly<{
  detail: AgentDetail
  lifecyclePending?: Readonly<{ kind: 'credential' | 'connection' | 'agent'; ref: string }>
  onRequestRevoke: (credentialRef: string, generation: number, trigger: HTMLButtonElement) => void
}>) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-foreground">Credential history</p>
      <ul className="m-0 list-none divide-y divide-border border-y border-border p-0">
        {detail.credentials.toReversed().map((credential) => (
          <li
            key={credential.credentialRef}
            className="flex flex-wrap items-center justify-between gap-intra py-intra text-sm"
          >
            <span className="grid gap-1">
              <span>Generation {credential.generation}</span>
              <span className="text-xs text-muted-foreground">
                Issued {formatTimestamp(credential.issuedAt)} · expires {formatTimestamp(credential.expiresAt)}
              </span>
              <span className="text-xs text-muted-foreground">
                Last authenticated {credential.lastAuthenticatedAt === undefined
                  ? 'not recorded'
                  : formatTimestamp(credential.lastAuthenticatedAt)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={credential.lifecycle === 'active' ? 'default' : 'outline'}>
                {credential.lifecycle === 'active'
                  ? credential.credentialRef === detail.currentCredentialRef ? 'Current' : 'Active'
                  : credential.lifecycle === 'stale'
                    ? 'Expired'
                    : 'Revoked'}
              </Badge>
              {credential.lifecycle === 'active' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={lifecyclePending !== undefined}
                  onClick={(event) => onRequestRevoke(credential.credentialRef, credential.generation, event.currentTarget)}
                >
                  {lifecyclePending?.kind === 'credential' && lifecyclePending.ref === credential.credentialRef
                    ? 'Revoking…'
                    : 'Revoke'}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
