import { Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
import type { ProviderWorkspaceIdentityDetailResult } from '@/components/ae/offerings/provider-workspace.functions'
import {
  filterOwnerSupplyAuthorityOptions,
  previewOwnerSupplySourceServer,
  publishOwnerSupplySourceServer,
  saveOwnerSupplySourceDraftServer,
  readOwnerProviderConnectionsServer,
  resumeOwnerSupplySourceDraftServer,
  startOwnerSupplySourceConnectionServer,
} from '@/modules/capability-supply/supply-funnel.functions'

export type AeOwnerSupplySourceStartPageProps = Readonly<{
  data: Readonly<{
    identity: ProviderWorkspaceIdentityDetailResult
    connections: Awaited<ReturnType<typeof readOwnerProviderConnectionsServer>>
    resume: Awaited<ReturnType<typeof resumeOwnerSupplySourceDraftServer>>
    resumeRequested: boolean
    sourceUnavailable: boolean
  }>
  search: Readonly<{
    connection?: string
    environment?: 'sandbox' | 'production'
    draft?: string
  }>
  navigate: (opts: Readonly<{
    search: Readonly<{
      draft: string
      connection?: string
      environment?: 'sandbox' | 'production'
    }>
    replace: true
  }>) => Promise<void>
}>

export function AeOwnerSupplySourceStartPage({ data, search, navigate }: AeOwnerSupplySourceStartPageProps) {
  const { identity, connections, resume, resumeRequested, sourceUnavailable } = data
  const preview = useServerFn(previewOwnerSupplySourceServer)
  const connect = useServerFn(startOwnerSupplySourceConnectionServer)
  const saveDraft = useServerFn(saveOwnerSupplySourceDraftServer)
  const publishRequest = useServerFn(publishOwnerSupplySourceServer)
  const publish = useReverification(publishRequest)

  return (
    <AeOperatorPage operatorRole="owner" title="Add Tool" description="Connect the interface you already operate. AE discovers the Tools and validates the one you submit." currentPath="/owner/operations/new" breadcrumbs={[{ label: 'Tools', href: '/owner/operations' }, { label: 'Add Tool' }]}>
      {identity.kind !== 'available' ? (
        <Alert variant="destructive">
          <AlertTitle>Provider workspace unavailable</AlertTitle>
          <AlertDescription className="grid gap-related">
            <p>AE could not confirm the current Business. Return to Tools and try again.</p>
            <Link
              to="/owner/operations"
              className={cn(buttonVariants({ variant: 'outline' }), 'justify-self-start min-h-touch')}
            >
              Return to Tools
            </Link>
          </AlertDescription>
        </Alert>
      ) : sourceUnavailable ? (
        <Alert variant="destructive"><AlertTitle>Saved source unavailable</AlertTitle><AlertDescription>AE could not read the saved source or current connections. Reload before starting or submitting another connection.</AlertDescription></Alert>
      ) : (<>
        {resumeRequested && resume.kind !== 'available' ? (
          <Alert variant="destructive" className="mb-5"><AlertTitle>Saved source could not be resumed</AlertTitle><AlertDescription>The saved source is unavailable or changed. Review it from Add Tool before starting another connection.</AlertDescription></Alert>
        ) : null}
        <AeSupplySourceNativeStart
          businessRef={identity.businessId}
          connections={filterOwnerSupplyAuthorityOptions(identity.businessId, connections)}
          {...(resume.kind === 'available' ? { initial: resume } : {})}
          onPreview={(source, idempotencyKey) => preview({ data: { businessId: identity.businessId, source, idempotencyKey } })}
          onConnect={(input) => connect({ data: input })}
          onSelectCandidate={(input) => saveDraft({ data: input })}
          onDraftSaved={async (candidateRef, connectionRef) => {
            await navigate({
              search: {
                draft: candidateRef,
                ...(connectionRef === undefined ? {} : { connection: connectionRef }),
                ...(search.environment === undefined ? {} : { environment: search.environment }),
              },
              replace: true,
            })
          }}
          onPublish={(input) => publish({ data: input })}
        />
      </>)}
    </AeOperatorPage>
  )
}
