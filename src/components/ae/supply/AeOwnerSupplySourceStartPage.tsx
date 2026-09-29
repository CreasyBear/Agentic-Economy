import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
import type { ProviderWorkspaceIdentityDetailResult } from '@/components/ae/offerings/provider-workspace.functions'
import {
  assessOwnerSupplySourceServer,
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
  const formRef = useRef<HTMLDivElement>(null)
  const [navigationSafety, setNavigationSafety] = useState<{
    dirty: boolean
    pending: boolean
    saveOutcome: 'idle' | 'saved' | 'failed' | 'outcome_unknown'
  }>({ dirty: false, pending: false, saveOutcome: 'idle' })
  const assess = useServerFn(assessOwnerSupplySourceServer)
  const preview = useServerFn(previewOwnerSupplySourceServer)
  const connect = useServerFn(startOwnerSupplySourceConnectionServer)
  const saveDraft = useServerFn(saveOwnerSupplySourceDraftServer)
  const publishRequest = useServerFn(publishOwnerSupplySourceServer)
  const publish = useReverification(publishRequest)

  return (
    <AeOperatorPage operatorRole="owner" title="Add Tool" description="Connect a Tool you already run. Agentic Economy checks what agents can buy." currentPath="/owner/operations/new" breadcrumbs={[{ label: 'Tools', href: '/owner/operations' }, { label: 'Add Tool' }]}>
      {identity.kind !== 'available' ? (
        <Alert variant="destructive">
          <AlertTitle>Provider Workspace unavailable</AlertTitle>
          <AlertDescription className="grid gap-related">
            <p>Agentic Economy could not confirm the current Business. Return to Tools and try again.</p>
            <Link
              to="/owner/operations"
              className={cn(buttonVariants({ variant: 'outline' }), 'justify-self-start min-h-touch')}
            >
              Return to Tools
            </Link>
          </AlertDescription>
        </Alert>
      ) : sourceUnavailable ? (
        <Alert variant="destructive"><AlertTitle>Saved source unavailable</AlertTitle><AlertDescription>Agentic Economy could not read the saved source or current connections. Reload before starting or submitting another connection.</AlertDescription></Alert>
      ) : (<>
        {resumeRequested && resume.kind !== 'available' ? (
          <Alert variant="destructive" className="mb-5"><AlertTitle>Saved source could not be resumed</AlertTitle><AlertDescription>The saved source is unavailable or changed. Review it from Add Tool before starting another connection.</AlertDescription></Alert>
        ) : null}
        <AeNavigationSafetyBoundary
          state={navigationSafety}
          title="Leave without saving these terms?"
          pendingTitle="Saving these terms"
          description="The terms you entered are not saved. Leave this page and they will be discarded."
          pendingDescription="Agentic Economy is still saving these terms."
          saveActionRef={formRef}
          headingRef={formRef}
        >
        <div ref={formRef} tabIndex={-1}>
        <AeSupplySourceNativeStart
          businessRef={identity.businessId}
          onNavigationSafetyChange={(next) => {
            setNavigationSafety((current) => (
              current.dirty === next.dirty && current.pending === next.pending && current.saveOutcome === next.saveOutcome
                ? current
                : next
            ))
          }}
          connections={filterOwnerSupplyAuthorityOptions(identity.businessId, connections)}
          {...(resume.kind === 'available' ? { initial: resume } : {})}
          onAssess={(input, signal) => assess({ data: input, signal })}
          onPreview={(source, idempotencyKey) => preview({ data: { businessId: identity.businessId, source, idempotencyKey } })}
          onConnect={(input) => connect({ data: input })}
          onSelectCandidate={(input) => saveDraft({ data: input })}
          onSaveTerms={(input) => saveDraft({ data: input })}
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
        </div>
        </AeNavigationSafetyBoundary>
      </>)}
    </AeOperatorPage>
  )
}
