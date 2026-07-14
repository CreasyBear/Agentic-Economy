import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { CustomerRequestRoutePlan } from '@/modules/customer-request/compiler'
import {
  createCustomerRequestRoutePlanGeneration,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import {
  compileRouteMandate,
  routeMandateAuthorityScopeDigest,
  routeMandateDigest,
  verifyRouteMandate,
  type RouteMandate,
} from '@/modules/customer-request/public'

describe('RouteMandate', () => {
  it('binds explicit customer authority to one exact multi-step RoutePlan', () => {
    const generation = routeGeneration()
    const selected = generation.routes[0]!
    const created = compileRouteMandate({
      generation,
      selectedRoutePlanId: selected.routePlanId,
      principal: {
        principalId: 'principal:customer',
        authenticationEvidenceRef: 'authentication:clerk-session:one',
      },
      authorization: {
        kind: 'explicit',
        authorizationEvidenceRef: 'authorization:customer-decision:one',
        authorizationEvidenceDigest: digest('customer-decision-one'),
        authorityScopeDigest: routeMandateAuthorityScopeDigest({
          generation,
          selectedRoutePlanId: selected.routePlanId,
          principalId: 'principal:customer',
          authorizationKind: 'explicit',
          maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
          issuedAt: 2_000,
          expiresAt: 9_000,
        }),
      },
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })

    expect(created, JSON.stringify(created)).toMatchObject({
      kind: 'compiled',
      mandate: {
        format: 'ae.route-mandate:v1',
        principal: {
          principalId: 'principal:customer',
          authenticationEvidenceRef: 'authentication:clerk-session:one',
        },
        authorization: {
          kind: 'explicit',
          authorizationEvidenceRef: 'authorization:customer-decision:one',
        },
        request: { requestId: 'request:one', requestRevision: 3 },
        route: {
          generationRef: generation.generationRef,
          generation: 1,
          generationDigest: generation.generationDigest,
          routePlanId: selected.routePlanId,
          routeDigest: selected.routeDigest,
          maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
          steps: [
            expect.objectContaining({
              position: 1,
              actionId: 'action:lookup',
              businessId: 'business:lookup',
              bindingId: 'binding:lookup',
              contractRef: expect.objectContaining({ capabilityId: 'catalog.lookup', version: 1 }),
              cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:lookup'] },
              recovery: { idempotency: 'required', recovery: 'retry_safe' },
            }),
            expect.objectContaining({
              position: 2,
              actionId: 'action:complete',
              businessId: 'business:complete',
              bindingId: 'binding:complete',
              contractRef: expect.objectContaining({ capabilityId: 'result.complete', version: 2 }),
              cancellation: { kind: 'adapter_managed', evidenceRefs: ['cancellation:complete'] },
              recovery: { idempotency: 'required', recovery: 'reconcile_required' },
            }),
          ],
          fallback: {
            kind: 'new_mandate_required',
            alternatives: [expect.objectContaining({ routePlanId: generation.routes[1]!.routePlanId })],
          },
        },
        issuedAt: 2_000,
        expiresAt: 9_000,
      },
    })
    if (created.kind !== 'compiled') throw new Error('route mandate setup failed')
    expect(verifyRouteMandate({
      mandate: created.mandate,
      generation,
      expectedPrincipal: {
        principalId: 'principal:customer',
        authenticationEvidenceRef: 'authentication:clerk-session:one',
      },
      expectedAuthorization: {
        kind: 'explicit',
        authorizationEvidenceRef: 'authorization:customer-decision:one',
        authorizationEvidenceDigest: digest('customer-decision-one'),
        authorityScopeDigest: routeMandateAuthorityScopeDigest({
          generation,
          selectedRoutePlanId: selected.routePlanId,
          principalId: 'principal:customer',
          authorizationKind: 'explicit',
          maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
          issuedAt: 2_000,
          expiresAt: 9_000,
        }),
      },
      now: 2_001,
    })).toEqual({ kind: 'verified', mandate: created.mandate })
  })

  it('rejects substituted authentication and authorization evidence even when the attacker recomputes the digest', () => {
    const generation = routeGeneration()
    const authorization = {
      kind: 'explicit' as const,
      authorizationEvidenceRef: 'authorization:customer-decision:one',
      authorizationEvidenceDigest: digest('customer-decision-one'),
      authorityScopeDigest: routeMandateAuthorityScopeDigest({
        generation,
        selectedRoutePlanId: generation.routes[0]!.routePlanId,
        principalId: 'principal:customer',
        authorizationKind: 'explicit',
        maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
        issuedAt: 2_000,
        expiresAt: 9_000,
      }),
    }
    const created = compileRouteMandate({
      generation,
      selectedRoutePlanId: generation.routes[0]!.routePlanId,
      principal: {
        principalId: 'principal:customer',
        authenticationEvidenceRef: 'authentication:clerk-session:one',
      },
      authorization,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })
    if (created.kind !== 'compiled') throw new Error('route mandate setup failed')
    const substituted = structuredClone(created.mandate) as DeepWritable<RouteMandate>
    substituted.principal.authenticationEvidenceRef = 'authentication:attacker-session'
    if (substituted.authorization.kind !== 'explicit') throw new Error('explicit authority setup failed')
    substituted.authorization.authorizationEvidenceRef = 'authorization:attacker-decision'
    substituted.authorization.authorizationEvidenceDigest = digest('attacker-decision')
    substituted.mandateDigest = routeMandateDigest(substituted)
    substituted.mandateRef = `route-mandate:v1:${substituted.mandateDigest}`

    expect(verifyRouteMandate({
      mandate: substituted,
      generation,
      expectedPrincipal: {
        principalId: 'principal:customer',
        authenticationEvidenceRef: 'authentication:clerk-session:one',
      },
      expectedAuthorization: authorization,
      now: 2_001,
    })).toEqual({ kind: 'refused', reason: 'authority_context_mismatch' })
  })

  it('rejects an attacker extending the approved expiry and recomputing the mandate digest', () => {
    const generation = routeGeneration()
    const principal = {
      principalId: 'principal:customer',
      authenticationEvidenceRef: 'authentication:clerk-session:one',
    }
    const authorization = {
      kind: 'explicit' as const,
      authorizationEvidenceRef: 'authorization:customer-decision:one',
      authorizationEvidenceDigest: digest('customer-decision-one'),
      authorityScopeDigest: routeMandateAuthorityScopeDigest({
        generation,
        selectedRoutePlanId: generation.routes[0]!.routePlanId,
        principalId: 'principal:customer',
        authorizationKind: 'explicit',
        maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
        issuedAt: 2_000,
        expiresAt: 9_000,
      }),
    }
    const created = compileRouteMandate({
      generation,
      selectedRoutePlanId: generation.routes[0]!.routePlanId,
      principal,
      authorization,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })
    if (created.kind !== 'compiled') throw new Error('route mandate setup failed')
    const widened = structuredClone(created.mandate) as DeepWritable<RouteMandate>
    widened.expiresAt = 9_500
    widened.mandateDigest = routeMandateDigest(widened)
    widened.mandateRef = `route-mandate:v1:${widened.mandateDigest}`

    expect(verifyRouteMandate({
      mandate: widened,
      generation,
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 2_001,
    })).toEqual({ kind: 'refused', reason: 'authority_scope_mismatch' })
  })

  it('returns a typed refusal when mandatory authority material is omitted and the digest is recomputed', () => {
    const generation = routeGeneration()
    const principal = {
      principalId: 'principal:customer',
      authenticationEvidenceRef: 'authentication:clerk-session:one',
    }
    const authorization = {
      kind: 'explicit' as const,
      authorizationEvidenceRef: 'authorization:customer-decision:one',
      authorizationEvidenceDigest: digest('customer-decision-one'),
      authorityScopeDigest: routeMandateAuthorityScopeDigest({
        generation,
        selectedRoutePlanId: generation.routes[0]!.routePlanId,
        principalId: principal.principalId,
        authorizationKind: 'explicit',
        maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
        issuedAt: 2_000,
        expiresAt: 9_000,
      }),
    }
    const created = compileRouteMandate({
      generation,
      selectedRoutePlanId: generation.routes[0]!.routePlanId,
      principal,
      authorization,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })
    if (created.kind !== 'compiled') throw new Error('route mandate setup failed')
    const omitted = structuredClone(created.mandate) as DeepWritable<RouteMandate> & {
      authorization?: DeepWritable<RouteMandate['authorization']>
    }
    Reflect.deleteProperty(omitted, 'authorization')
    omitted.mandateDigest = routeMandateDigest(omitted as RouteMandate)
    omitted.mandateRef = `route-mandate:v1:${omitted.mandateDigest}`

    expect(verifyRouteMandate({
      mandate: omitted as RouteMandate,
      generation,
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 2_001,
    })).toEqual({ kind: 'refused', reason: 'mandate_integrity_invalid' })
  })

  it('binds separately verified standing low-risk policy evidence without treating it as explicit authority', () => {
    const generation = routeGeneration()
    const selectedRoutePlanId = generation.routes[0]!.routePlanId
    const principal = {
      principalId: 'principal:customer',
      authenticationEvidenceRef: 'authentication:delegated-agent:one',
    }
    const authorization = {
      kind: 'standing_low_risk' as const,
      standingPolicyRef: 'standing-policy:one',
      standingPolicyDigest: digest('standing-policy-one'),
      authorityUseRef: 'standing-policy-use:one',
      authorityScopeDigest: routeMandateAuthorityScopeDigest({
        generation,
        selectedRoutePlanId,
        principalId: 'principal:customer',
        authorizationKind: 'standing_low_risk',
        maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
        issuedAt: 2_000,
        expiresAt: 9_000,
      }),
    }
    const result = compileRouteMandate({
      generation,
      selectedRoutePlanId,
      principal,
      authorization,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })

    if (result.kind !== 'compiled') throw new Error('standing route mandate setup failed')
    expect(result.mandate.authorization.kind).toBe('standing_low_risk')
    expect(verifyRouteMandate({
      mandate: result.mandate,
      generation,
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 2_001,
    })).toEqual({ kind: 'verified', mandate: result.mandate })
  })

  it('rejects unknown authorization variants and recomputed unknown or unscoped material', () => {
    const generation = routeGeneration()
    const principal = {
      principalId: 'principal:customer',
      authenticationEvidenceRef: 'authentication:clerk-session:one',
    }
    const authorization = explicitAuthorization(generation, generation.routes[0]!.routePlanId)
    expect(compileRouteMandate({
      generation,
      selectedRoutePlanId: generation.routes[0]!.routePlanId,
      principal,
      authorization: {
        ...authorization,
        kind: 'unknown_authority',
      } as never,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })).toEqual({ kind: 'refused', reason: 'mandate_material_invalid' })

    const compiled = compileRouteMandate({
      generation,
      selectedRoutePlanId: generation.routes[0]!.routePlanId,
      principal,
      authorization,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })
    if (compiled.kind !== 'compiled') throw new Error('route mandate setup failed')
    const issuedAtChanged = structuredClone(compiled.mandate) as DeepWritable<RouteMandate>
    issuedAtChanged.issuedAt = 2_100
    issuedAtChanged.mandateDigest = routeMandateDigest(issuedAtChanged)
    issuedAtChanged.mandateRef = `route-mandate:v1:${issuedAtChanged.mandateDigest}`
    expect(verifyRouteMandate({
      mandate: issuedAtChanged,
      generation,
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 2_101,
    })).toEqual({ kind: 'refused', reason: 'authority_scope_mismatch' })

    const extraRoot = structuredClone(compiled.mandate) as DeepWritable<RouteMandate> & { unknown?: string }
    extraRoot.unknown = 'not-authorized'
    extraRoot.mandateDigest = routeMandateDigest(extraRoot)
    extraRoot.mandateRef = `route-mandate:v1:${extraRoot.mandateDigest}`
    expect(verifyRouteMandate({
      mandate: extraRoot,
      generation,
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 2_001,
    })).toEqual({ kind: 'refused', reason: 'mandate_integrity_invalid' })
  })

  it('rejects every recomputed substitution of route, supply, data, effect, evidence, cancellation and recovery scope', () => {
    const generation = routeGeneration()
    const principal = {
      principalId: 'principal:customer',
      authenticationEvidenceRef: 'authentication:clerk-session:one',
    }
    const authorization = explicitAuthorization(generation, generation.routes[0]!.routePlanId)
    const created = compileRouteMandate({
      generation,
      selectedRoutePlanId: generation.routes[0]!.routePlanId,
      principal,
      authorization,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })
    if (created.kind !== 'compiled') throw new Error('route mandate setup failed')
    const variants: Array<(mandate: DeepWritable<RouteMandate>) => void> = [
      (mandate) => { mandate.request.requestRevision += 1 },
      (mandate) => { mandate.route.steps[0]!.contractRef.version += 1 },
      (mandate) => { mandate.route.steps[0]!.bindingId = 'binding:substituted' },
      (mandate) => { mandate.route.steps[0]!.dataScope[0]!.purposes = ['widened_purpose'] },
      (mandate) => { mandate.route.steps[0]!.effects[0]!.reversibility = 'reversible' },
      (mandate) => { mandate.route.steps[0]!.evidence[0]!.evidenceId = 'evidence:substituted' },
      (mandate) => { mandate.route.steps[0]!.cancellation.kind = 'adapter_managed' },
      (mandate) => { mandate.route.steps[0]!.recovery.recovery = 'reconcile_required' },
      (mandate) => { mandate.route.fallback.alternatives[0]!.routeDigest = digest('fallback:substituted') },
      (mandate) => { mandate.route.maximumTotalSpend.amountMinor += 1 },
    ]
    for (const mutate of variants) {
      const substituted = structuredClone(created.mandate) as DeepWritable<RouteMandate>
      mutate(substituted)
      substituted.mandateDigest = routeMandateDigest(substituted)
      substituted.mandateRef = `route-mandate:v1:${substituted.mandateDigest}`
      expect(verifyRouteMandate({
        mandate: substituted,
        generation,
        expectedPrincipal: principal,
        expectedAuthorization: authorization,
        now: 2_001,
      }).kind).toBe('refused')
    }
  })

  it('rejects a mandate against a different immutable generation and after expiry', () => {
    const generation = routeGeneration()
    const principal = {
      principalId: 'principal:customer',
      authenticationEvidenceRef: 'authentication:clerk-session:one',
    }
    const authorization = explicitAuthorization(generation, generation.routes[0]!.routePlanId)
    const created = compileRouteMandate({
      generation,
      selectedRoutePlanId: generation.routes[0]!.routePlanId,
      principal,
      authorization,
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })
    if (created.kind !== 'compiled') throw new Error('route mandate setup failed')

    expect(verifyRouteMandate({
      mandate: created.mandate,
      generation: routeGeneration(2),
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 2_001,
    })).toEqual({ kind: 'refused', reason: 'route_generation_mismatch' })
    expect(verifyRouteMandate({
      mandate: created.mandate,
      generation,
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 1_999,
    })).toEqual({ kind: 'refused', reason: 'mandate_not_yet_valid' })
    expect(verifyRouteMandate({
      mandate: created.mandate,
      generation,
      expectedPrincipal: principal,
      expectedAuthorization: authorization,
      now: 9_000,
    })).toEqual({ kind: 'refused', reason: 'mandate_expired' })
  })

  it('returns a typed refusal for omitted runtime generation material', () => {
    const malformedGeneration = { decisionSnapshot: {}, generation: 1 } as CustomerRequestRoutePlanGeneration
    expect(compileRouteMandate({
      generation: malformedGeneration,
      selectedRoutePlanId: 'route:missing',
      principal: {
        principalId: 'principal:customer',
        authenticationEvidenceRef: 'authentication:clerk-session:one',
      },
      authorization: {
        kind: 'explicit',
        authorizationEvidenceRef: 'authorization:customer-decision:one',
        authorizationEvidenceDigest: digest('customer-decision-one'),
        authorityScopeDigest: digest('scope'),
      },
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      expiresAt: 9_000,
      now: 2_000,
    })).toEqual({ kind: 'refused', reason: 'route_generation_invalid' })
    expect(() => routeMandateAuthorityScopeDigest({
      generation: malformedGeneration,
      selectedRoutePlanId: 'route:missing',
      principalId: 'principal:customer',
      authorizationKind: 'explicit',
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      issuedAt: 2_000,
      expiresAt: 9_000,
    })).toThrow('route_mandate_authority_scope_invalid')
  })
})

function routeGeneration(generation = 1): CustomerRequestRoutePlanGeneration {
  const firstDraft = routeDraft('one', [
    step({
      actionId: 'action:lookup', capabilityId: 'catalog.lookup', version: 1,
      businessId: 'business:lookup', amountMinor: 400,
      cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:lookup'] },
      recovery: 'retry_safe',
    }),
    step({
      actionId: 'action:complete', capabilityId: 'result.complete', version: 2,
      businessId: 'business:complete', amountMinor: 600,
      cancellation: { kind: 'adapter_managed', evidenceRefs: ['cancellation:complete'] },
      recovery: 'reconcile_required',
    }),
  ])
  const secondDraft = routeDraft('two', [
    step({
      actionId: 'action:lookup:alternative', capabilityId: 'catalog.lookup', version: 1,
      businessId: 'business:lookup:alternative', amountMinor: 450,
      cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:lookup:alternative'] },
      recovery: 'retry_safe',
    }),
    step({
      actionId: 'action:complete:alternative', capabilityId: 'result.complete', version: 2,
      businessId: 'business:complete:alternative', amountMinor: 650,
      cancellation: { kind: 'adapter_managed', evidenceRefs: ['cancellation:complete:alternative'] },
      recovery: 'reconcile_required',
    }),
  ])
  const routes = [
    finalizeRoute(firstDraft, [secondDraft.routePlanId], 1),
    finalizeRoute(secondDraft, [firstDraft.routePlanId], 2),
  ]
  return createCustomerRequestRoutePlanGeneration({
    generation,
    requestId: 'request:one',
    requestRevision: 3,
    compiler: {
      compilerVersion: 'customer-request-route-compiler:v1',
      interpreterId: 'interpreter:test',
      interpretationEvidence: { kind: 'deterministic_input' },
      proposalDigest: digest('proposal'),
    },
    registrySnapshotDigest: digest('registry'),
    decisionSnapshot: {
      requestSnapshotDigest: digest('request-snapshot'),
      factsDigest: digest('facts'),
      criteria: [],
      completionRequirements: [],
      evaluationDigest: digest('evaluation'),
      planRevisionId: 'plan:one',
      planDigest: digest('plan'),
    },
    routes,
    createdAt: 1_000,
  })
}

type RouteStep = CustomerRequestRoutePlan['steps'][number]
type RouteDraft = Omit<CustomerRequestRoutePlan, 'fallbacks' | 'routeDigest'>
type DeepWritable<Value> = Value extends string | number | boolean | null | undefined
  ? Value
  : Value extends readonly (infer Item)[]
    ? DeepWritable<Item>[]
    : Value extends object
      ? { -readonly [Key in keyof Value]: DeepWritable<Value[Key]> }
      : Value

function step(input: Readonly<{
  actionId: string
  capabilityId: string
  version: number
  businessId: string
  amountMinor: number
  cancellation: RouteStep['cancellation']
  recovery: RouteStep['recovery']['recovery']
}>): RouteStep {
  const suffix = input.businessId.replaceAll(':', '-')
  return {
    actionId: input.actionId,
    candidateRef: `candidate:${suffix}`,
    businessId: input.businessId,
    offeringId: `offering:${suffix}`,
    bindingId: `binding:${input.businessId.split(':').at(-1)}`,
    contractRef: {
      capabilityId: input.capabilityId,
      version: input.version,
      contractDigest: digest(`contract:${input.capabilityId}:${input.version}`),
    },
    offeringRegistrationHash: digest(`offering:${suffix}`),
    bindingRegistrationHash: digest(`binding:${suffix}`),
    publicationRef: `publication:${suffix}`,
    publicationRevision: 1,
    resolvedInputs: [],
    deferredInputs: [],
    price: { kind: 'fixed', currency: 'AUD', amountMinor: input.amountMinor },
    dataUse: [{
      effectId: `share:${suffix}`,
      inputPointer: '/request',
      classification: 'personal',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['complete_customer_request'],
    }],
    effects: [{
      effectId: `share:${suffix}`,
      class: 'data_release',
      authority: 'explicit',
      reversibility: 'irreversible',
    }],
    evidence: [{
      evidenceId: `result:${suffix}`,
      outputPointer: '/result',
      purpose: 'completion',
      annotationId: `result:${suffix}`,
      label: 'Completed result',
      role: 'completion_evidence',
      guaranteed: true,
      schemaIdentity: digest(`schema:${suffix}`) as never,
    }],
    cancellation: input.cancellation,
    recovery: { idempotency: 'required', recovery: input.recovery },
  }
}

function routeDraft(suffix: string, steps: readonly RouteStep[]): RouteDraft {
  const edges = [{
    mappingId: `mapping:${suffix}`,
    semanticIdentity: 'ae.result:v1',
    source: {
      actionId: steps[0]!.actionId,
      annotationId: 'result',
      evidenceId: steps[0]!.evidence[0]!.evidenceId,
      outputPointer: '/result',
    },
    target: { annotationId: 'result', inputKey: 'result' as never, inputPointer: '/result' },
    schemaIdentity: digest('schema:result') as never,
    authority: 'registered_contract_semantics' as const,
    fromStep: steps[0]!.actionId,
    toStep: steps[1]!.actionId,
  }]
  const comparison = {
    fit: 'all_steps_viable' as const,
    completeness: 'complete' as const,
    dataExposureCount: 2,
    irreversibleEffectCount: 2,
    evidenceRequirementCount: 2,
    trust: 'registered_live_supply' as const,
    ordering: { kind: 'unranked' as const },
  }
  const core = {
    requestId: 'request:one',
    requestRevision: 3,
    registrySnapshotDigest: digest('registry'),
    steps,
    edges,
    maximumTotalCost: {
      kind: 'known' as const,
      currency: 'AUD',
      amountMinor: steps.reduce((total, candidate) => (
        total + (candidate.price.kind === 'fixed' ? candidate.price.amountMinor : 0)
      ), 0),
    },
    expiresAt: 10_000,
    uncertainty: [] as const,
    comparison,
    authority: 'proposal_only' as const,
  }
  const { ordering: _ordering, ...baseComparison } = comparison
  const routePlanIdMaterial = { ...core, comparison: baseComparison }
  return { routePlanId: `route:${canonicalDigest(routePlanIdMaterial as StableHashValue)}`, ...core }
}

function finalizeRoute(draft: RouteDraft, alternatives: readonly string[], position: number): CustomerRequestRoutePlan {
  const material = {
    ...draft,
    fallbacks: {
      ordering: 'unranked' as const,
      alternatives: alternatives.map((alternativeRouteRef) => ({
        alternativeRouteRef,
        when: 'route_unavailable_before_approval' as const,
      })),
    },
    comparison: {
      ...draft.comparison,
      ordering: { kind: 'ranked' as const, objective: 'lowest_maximum_price' as const, position },
    },
  }
  return { ...material, routeDigest: canonicalDigest(material as StableHashValue) }
}

function digest(value: string): string {
  return canonicalDigest(value)
}

function explicitAuthorization(
  generation: CustomerRequestRoutePlanGeneration,
  selectedRoutePlanId: string,
) {
  return {
    kind: 'explicit' as const,
    authorizationEvidenceRef: 'authorization:customer-decision:one',
    authorizationEvidenceDigest: digest('customer-decision-one'),
    authorityScopeDigest: routeMandateAuthorityScopeDigest({
      generation,
      selectedRoutePlanId,
      principalId: 'principal:customer',
      authorizationKind: 'explicit',
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      issuedAt: 2_000,
      expiresAt: 9_000,
    }),
  }
}
