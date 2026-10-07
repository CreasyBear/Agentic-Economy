import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { republishPreparedCapabilityCommand } from '@/modules/capability-supply/public'
import { publicationPorts, rebuildCapabilityOriginSupplyProjection } from '../../../capabilitySupply'
import { upsertProviderToolIdentity } from '../../../capabilityProviderToolProjection'
import { scheduleProviderDirectoryProjection } from '../publish/prepared'
import { verifySupplyAgentPrincipal } from '../../../agentAccessPrincipals'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { resolveBusinessActor } from '../../../authz'
import { admitAgentPublicationConsequence } from '../../authority/consequence/publication'
import { admitInteractiveOwnerConsequence } from '../../authority/consequence/owner'
import type { OwnerSupplyCommandArgs, OwnerSupplyCommandResult } from './contracts'
import { loadOwnerSupplyPublication } from './maintenance'
import { reconstructPreparedRepublishMaterial } from './republishMaterial'

export async function republishOwnerCapabilityHandler(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
): Promise<OwnerSupplyCommandResult> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected')
      return { kind: 'refused', reason: 'authorization_denied' }
    const loaded = await loadOwnerSupplyPublication(ctx, args)
    if (loaded.kind === 'refused') return loaded
    if (loaded.publication.disposition !== 'withdrawn') {
      return { kind: 'refused', reason: 'revision_changed' }
    }
    const agentAdmission = args.agentPrincipal === undefined
      ? undefined
      : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
    const ownerActor = args.agentPrincipal === undefined
      ? await resolveBusinessActor(ctx)
      : undefined
    if (agentAdmission?.kind !== 'allowed'
      && ownerActor?.kind !== 'authenticated_owner')
      return { kind: 'refused', reason: 'authorization_denied' }
    const reconstructed = await reconstructPreparedRepublishMaterial(
      ctx,
      loaded.publication,
      args.evidenceRefs,
    )
    if (reconstructed.kind === 'refused') return reconstructed
    const now = Date.now()
    const consequenceCommand = {
      version: 'ae.publication-consequence:v1',
      action: 'publication.republish',
      operationKey: args.operationKey,
      businessId: String(args.businessId),
      offeringRef: args.offeringRef,
      offeringRevision: args.offeringRevision,
      offeringSourceHash: args.offeringSourceHash,
      publicationRef: args.publicationRef,
      expectedPublicationRevision: args.publicationRevision,
      nextPublicationRevision: args.publicationRevision + 1,
      sourceDigest: reconstructed.prepared.sourceDigest,
      priceDigest: reconstructed.prepared.priceDigest,
      bindingId: reconstructed.prepared.binding.bindingId,
      documentDigest: canonicalDigest(reconstructed.prepared.documentJson),
    }
    if (agentAdmission?.kind === 'allowed') {
      const consequence = await admitAgentPublicationConsequence(ctx, {
        agent: agentAdmission,
        action: 'publication.republish',
        target: {
          targetType: 'capability_publication',
          targetRef: args.publicationRef,
          targetRevision: args.publicationRevision,
        },
        resourceRefs: [`publication:${args.publicationRef}`],
        consequenceSummary: 'Republish this exact withdrawn Tool revision to the market.',
        statusReadbackRef: `owner/operations/${args.offeringRef}`,
        correlationRef: args.correlationId,
        idempotencyRef: args.operationKey,
        command: consequenceCommand,
        now,
      })
      if (consequence === null) {
        return { kind: 'refused', reason: 'authorization_denied' }
      }
    }
    if (ownerActor?.kind === 'authenticated_owner') {
      const consequence = await admitInteractiveOwnerConsequence(ctx, {
        actor: ownerActor,
        action: 'publication.republish',
        target: {
          targetType: 'capability_publication',
          targetRef: args.publicationRef,
          targetRevision: args.publicationRevision,
        },
        requiredScopes: ['catalog_publish'],
        resourceRefs: [`publication:${args.publicationRef}`],
        budgetAmount: 0,
        consequenceSummary: 'Republish this exact withdrawn Tool revision to the market.',
        statusReadbackRef: `owner/operations/${args.offeringRef}`,
        correlationRef: args.correlationId,
        idempotencyRef: args.operationKey,
        command: consequenceCommand,
        ...(args.proof === undefined ? {} : { proof: args.proof }),
        now,
      })
      if (consequence.kind === 'refused') {
        return { kind: 'refused', reason: consequence.code }
      }
    }
    const result = await republishPreparedCapabilityCommand(
      {
        businessId: String(args.businessId),
        runtimeEnvironment: loaded.publication.runtimeEnvironment,
        publication: loaded.publication,
        prepared: reconstructed.prepared,
        origin: reconstructed.origin,
        actor: {
          kind: 'owner',
          ref: agentAdmission?.kind === 'allowed'
            ? agentAdmission.principalId
            : ownerActor?.kind === 'authenticated_owner'
              ? ownerActor.canonicalPrincipalRef
              : '',
        },
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        reasonCode: args.reasonCode,
        evidenceRefs: args.evidenceRefs,
        now,
      },
      publicationPorts(ctx),
    )
    if (result.kind === 'refused') return result
    await upsertProviderToolIdentity(ctx, {
      businessId: args.businessId,
      providerRef: reconstructed.prepared.binding.authority.kind === 'provider_connection'
        ? reconstructed.prepared.binding.authority.providerRef
        : String(args.businessId),
      toolRef: result.toolRef,
      offeringRef: args.offeringRef,
      offeringRevision: args.offeringRevision,
      publicationRef: result.publicationRef,
      publicationRevision: result.publicationRevision,
      offeringId: result.offeringId,
      bindingId: result.bindingId,
      updatedAt: now,
    })
    await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, now)
    await scheduleProviderDirectoryProjection(ctx, result.publicationRef, result.publicationRevision)
    return {
      kind: 'republished',
      publicationRef: result.publicationRef,
      revision: result.publicationRevision,
      toolRef: result.toolRef,
      bindingId: result.bindingId,
      lifecycle: {
        state: result.lifecycle.state === 'active' ? 'active' : 'inactive',
        reasons: [...result.lifecycle.reasons],
      },
    }
}
