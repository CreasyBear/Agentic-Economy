import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteStates'
import { AeSection } from '@/components/ae/layout/AeSection'
import type {
  ProviderToolStatusResult,
  ProviderWorkspaceIdentityDetailResult,
} from '@/components/ae/offerings/provider-workspace.functions'
import { AeProviderToolDetail } from '@/components/ae/supply/AeProviderToolDetail'
import { OWNER_TOOL_DETAIL_COPY } from '@/components/ae/supply/owner-tool-detail.contracts'
import type { ProviderToolActionOutcome } from '@/modules/capability-supply/provider-tool-actions.contracts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/ui/format-time'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  recheckOwnerCapabilityServer,
  republishOwnerCapabilityServer,
  withdrawOwnerCapabilityServer,
  type OwnerSupplyCommandResult,
  type OwnerSupplyMaintenanceInput,
  type SupplyFunnelActionContext,
} from '@/modules/capability-supply/supply-funnel.functions'

type AeOwnerToolDetailPageProps = Readonly<{
  toolRef: string
  identity: ProviderWorkspaceIdentityDetailResult
  status: ProviderToolStatusResult
}>

export function AeOwnerToolDetailPage({ toolRef, identity, status }: AeOwnerToolDetailPageProps) {
  const router = useRouter()
  const [toolKeys] = useState(() => new Map<string, string>())
  const recheck = useServerFn(recheckOwnerCapabilityServer)
  const withdraw = useServerFn(withdrawOwnerCapabilityServer)
  const republishRequest = useServerFn(republishOwnerCapabilityServer)
  const republish = useReverification(republishRequest)

  if (identity.kind !== 'available') {
    return <UnavailableTool toolRef={toolRef} unavailable={status.kind === 'unavailable'} />
  }
  if (status.kind !== 'available') {
    if (status.kind === 'not_found') {
      return (
        <OperatorRouteNotFoundRecovery
          recoveryHref="/owner/operations"
          recoveryLabel={OWNER_TOOL_DETAIL_COPY.notFoundRecoveryLabel}
        />
      )
    }
    return <UnavailableTool toolRef={toolRef} unavailable />
  }
  // Well 8 Lane C: the URL held either this Tool's slug (live reviewed-tier
  // publication) or its offeringRef (no publication yet) - only one matches
  // depending on lifecycle phase, so accept whichever the loader resolved.
  if (
    (status.tool.slug !== toolRef && status.tool.offeringRef !== toolRef)
    || status.status.businessRef !== identity.businessId
  ) {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/owner/operations"
        recoveryLabel={OWNER_TOOL_DETAIL_COPY.notFoundRecoveryLabel}
      />
    )
  }
  const context: SupplyFunnelActionContext | undefined = status.maintenance === undefined
    ? undefined
    : { businessId: identity.businessId, ...status.maintenance }
  const name = status.tool.name
  const resumeHref = status.resumeCandidateRef === undefined
    ? undefined
    : `/owner/operations/new?draft=${encodeURIComponent(status.resumeCandidateRef)}`

  function maintenanceAction(
    action: 'recheck' | 'withdraw' | 'republish',
    serverFn: (input: { data: OwnerSupplyMaintenanceInput }) => Promise<OwnerSupplyCommandResult>,
  ): (() => Promise<ProviderToolActionOutcome>) | undefined {
    if (context === undefined) return undefined
    return async () => {
      const actionKey = `${action}:${canonicalDigest(context)}`
      let toolKey = toolKeys.get(actionKey)
      if (toolKey === undefined) {
        toolKey = `owner-supply:${action}:${crypto.randomUUID()}`
        toolKeys.set(actionKey, toolKey)
      }
      const outcome = await serverFn({ data: maintenanceCommand(context, action, toolKey) })
      if (!sourceUnavailable(outcome)) toolKeys.delete(actionKey)
      if (outcome.kind === 'refused') return { kind: 'refused', message: correctionRefusal(outcome.reason) }
      await router.invalidate()
      return { kind: 'applied', message: correctionMessage(outcome) }
    }
  }

  const onRecheck = maintenanceAction('recheck', recheck)
  const onWithdraw = maintenanceAction('withdraw', withdraw)
  const onRepublish = maintenanceAction('republish', republish)
  return (
    <AeOperatorPage
      operatorRole="owner"
      title={name}
      description="Current publication, source health, delivery and Qualified Use."
      currentPath={`/owner/operations/${encodeURIComponent(toolRef)}`}
      breadcrumbs={[{ label: 'Tools', href: '/owner/operations' }, { label: name }]}
    >
      <AeSection title={OWNER_TOOL_DETAIL_COPY.overviewTitle}>
        <AeFactList
          density="compact"
          className="grid-cols-2 sm:grid-cols-4"
          facts={[
            {
              label: OWNER_TOOL_DETAIL_COPY.priceLabel,
              value: status.tool.pricingLabel ?? OWNER_TOOL_DETAIL_COPY.missingValue,
            },
            { label: OWNER_TOOL_DETAIL_COPY.statusLabel, value: status.status.state },
            {
              label: OWNER_TOOL_DETAIL_COPY.callsLabel,
              value: status.tool.callsCount === undefined
                ? OWNER_TOOL_DETAIL_COPY.missingValue
                : `${status.tool.callsCount.toLocaleString('en-AU')} Calls`,
            },
            {
              label: OWNER_TOOL_DETAIL_COPY.updatedLabel,
              value: formatTimestamp(status.status.observedAt),
            },
          ]}
        />
        {status.tool.slug === undefined ? null : (
          <Link
            to="/tools/$providerHost/$slug"
            params={{ providerHost: identity.slug, slug: status.tool.slug }}
            className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch w-fit')}
          >
            {OWNER_TOOL_DETAIL_COPY.publicPreviewLabel}
          </Link>
        )}
      </AeSection>
      <AeProviderToolDetail
        name={name}
        status={status.status}
        showTestPlayground={status.status.state === 'Published' || Boolean(status.status.routeability?.available)}
        {...(resumeHref === undefined ? {} : { resumeHref })}
        onRefresh={async () => {
          await router.invalidate()
          return { kind: 'applied', message: 'The canonical Tool status is current.' }
        }}
        {...(onRecheck === undefined ? {} : { onRecheck })}
        {...(onWithdraw === undefined ? {} : { onWithdraw })}
        {...(onRepublish === undefined ? {} : { onRepublish })}
      />
    </AeOperatorPage>
  )
}

function UnavailableTool({ toolRef, unavailable }: Readonly<{ toolRef: string; unavailable: boolean }>) {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Tool status"
      description="Agentic Economy could not confirm this Tool."
      currentPath={`/owner/operations/${encodeURIComponent(toolRef)}`}
    >
      <div className="grid gap-related">
        <Alert variant={unavailable ? 'destructive' : 'default'}>
          <AlertTitle>{unavailable ? 'Tool status unavailable' : 'Tool not found'}</AlertTitle>
          <AlertDescription>
            {unavailable
              ? 'Agentic Economy could not read the canonical lifecycle. No Tool was changed.'
              : 'This Tool is not part of the current Provider workspace.'}
          </AlertDescription>
        </Alert>
        <Link
          to="/owner/operations"
          className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch w-fit')}
        >
          Return to Tools
        </Link>
      </div>
    </AeOperatorPage>
  )
}

function maintenanceCommand(
  context: SupplyFunnelActionContext,
  action: 'recheck' | 'withdraw' | 'republish',
  toolKey: string,
): OwnerSupplyMaintenanceInput {
  return {
    ...context,
    operationKey: toolKey,
    correlationId: `owner-supply:${action}:${context.offeringRef}`,
    reasonCode: `owner_supply_${action}`,
    evidenceRefs: ['owner-supply:tool-status'],
  }
}

function correctionMessage(result: Exclude<OwnerSupplyCommandResult, { kind: 'refused' }>): string {
  if (result.kind === 'withdrawn') return 'The Tool is withdrawn and no longer accepts new work.'
  if (result.kind === 'republished') return 'The Tool was submitted for validation before returning to the market.'
  return 'Agentic Economy scheduled a fresh source and readiness check for this Tool.'
}

function correctionRefusal(reason: string): string {
  if (reason === 'revision_changed' || reason === 'publication_stale') {
    return 'The Tool changed elsewhere. Reload its current status before trying again.'
  }
  if (reason === 'source_unavailable') {
    return 'Agentic Economy could not confirm the source. Reload this Tool before trying another action.'
  }
  return 'Agentic Economy refused this change because the current Tool no longer satisfies its required preconditions.'
}

function sourceUnavailable(result: OwnerSupplyCommandResult): boolean {
  return result.kind === 'refused' && result.reason === 'source_unavailable'
}
