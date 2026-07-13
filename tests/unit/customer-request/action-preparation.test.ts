import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import {
  authorizeActionPreparation,
  projectActionPreparation,
} from '@/modules/customer-request/action-preparation'

describe('exact V2 Action Preparation', () => {
  it('derives the complete disclosure and authority scope from the exact registered capability', () => {
    const { aggregate, model, actionId } = compiledProtectedRequest()

    const prepared = projectActionPreparation({ aggregate, actionId, model, now: 2_000 })

    expect(prepared).toMatchObject({
      kind: 'needs_authority',
      lineage: {
        requestId: aggregate.snapshot.requestId,
        requestRevision: aggregate.snapshot.revision,
        planRevisionId: aggregate.plan.planRevisionId,
        planDigest: aggregate.plan.planDigest,
        actionId,
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        semanticDigest: model.semanticDigest,
      },
      disclosureReview: {
        categories: [{ label: 'Destination', classification: 'personal' }],
        purposes: ['compare_options'],
      },
      authorityScope: {
        declarations: [{
          inputPointer: '/destination',
          classification: 'personal',
          phase: 'preparation',
          recipient: { kind: 'candidate_binding' },
          purposes: ['compare_options'],
          effect: {
            effectId: 'destination_release', class: 'data_release',
            authority: 'explicit', reversibility: 'irreversible',
          },
          inputs: [{ inputPointer: '/destination', label: 'Destination' }],
        }],
      },
    })
    expect(JSON.stringify(prepared)).not.toContain('permittedFields')
    expect(JSON.stringify(prepared)).not.toContain('capabilityContractId')
  })

  it('reserves authority only from an explicit verified command against the current durable review', () => {
    const { aggregate, model, actionId } = compiledProtectedRequest()
    const prepared = projectActionPreparation({ aggregate, actionId, model, now: 2_000 })
    if (prepared.kind !== 'needs_authority') throw new Error(`unexpected ${prepared.kind}`)

    const authorized = authorizeActionPreparation({
      preparation: prepared,
      authorityReference: prepared.preparationRef,
      authority: {
        kind: 'service_assertion', principalId: aggregate.snapshot.principalId,
        ownerId: 'owner:customer', credentialId: 'api-key:1',
        evidenceRef: 'service-assertion:verified:1', verifiedAt: 2_010,
      },
    })

    expect(authorized).toMatchObject({
      kind: 'ready_for_routing', preparationRef: prepared.preparationRef,
      authorityReservation: {
        authorityReference: prepared.preparationRef,
        principalId: aggregate.snapshot.principalId,
        verification: { kind: 'service_assertion', evidenceRef: 'service-assertion:verified:1' },
      },
    })
    expect(authorized.authorityReservation.authorityScopeDigest).toBe(prepared.authorityScope.authorityScopeDigest)
    expect(authorized.authorityReservation.lineage).toEqual(prepared.lineage)
    expect(() => authorizeActionPreparation({
      preparation: prepared,
      authorityReference: 'preparation:other',
      authority: {
        kind: 'service_assertion', principalId: aggregate.snapshot.principalId,
        ownerId: 'owner:customer', credentialId: 'api-key:1',
        evidenceRef: 'service-assertion:verified:1', verifiedAt: 2_010,
      },
    })).toThrow('action_preparation_authority_reference_mismatch')
  })

  it('keeps commitment information gaps typed and exact', () => {
    const { model } = compiledProtectedRequest()
    const compiled = compileCustomerRequest({
      requestId: 'request:missing:1', expectedRevision: 0,
      principalId: 'principal:customer', delegatedAgentId: 'agent:customer',
      intent: 'Find an option', networkId: 'ae:public', interpreterId: 'test:interpreter',
      bindings: [{
        businessId: 'business:one', offeringId: 'offering:one', bindingId: 'binding:one',
        contractRef: model.contractRef, offeringRegistrationHash: 'offering-hash:one',
        bindingRegistrationHash: 'binding-hash:one',
      }],
      models: [model], now: 1_000,
      proposal: {
        kind: 'capability_candidates',
        selections: [{ selectionKey: model.selectionKey, contractRef: model.contractRef, facts: [] }],
      },
    })
    if (compiled.kind !== 'compiled') throw new Error(compiled.reason)
    const actionId = compiled.aggregate.plan.actions[0]?.actionId
    if (actionId === undefined) throw new Error('action missing')

    expect(projectActionPreparation({ aggregate: compiled.aggregate, actionId, model, now: 2_000 })).toMatchObject({
      kind: 'needs_information',
      missing: [{ inputPointer: '/destination', label: 'Destination' }],
      lineage: { contractRef: model.contractRef, selectionKey: model.selectionKey, semanticDigest: model.semanticDigest },
    })
  })

  it('fails closed when action or capability semantic authority drifts', () => {
    const { aggregate, model, actionId } = compiledProtectedRequest()
    const drifted = { ...model, semanticDigest: 'sha256:' + 'd'.repeat(64) }

    expect(projectActionPreparation({ aggregate, actionId, model: drifted, now: 2_000 })).toEqual({
      kind: 'stale', reason: 'capability_authority_changed',
    })
    expect(projectActionPreparation({ aggregate, actionId: 'action:unknown', model, now: 2_000 })).toEqual({
      kind: 'refused', reason: 'action_not_found',
    })
  })
})

function compiledProtectedRequest() {
  const model = openCapabilityDecisionModel(defineCapabilityContract(protectedContract()))
  const destination = model.inputs.find((input) => input.annotationId === 'destination')
  if (destination === undefined) throw new Error('destination input missing')
  const binding = {
    businessId: 'business:one', offeringId: 'offering:one', bindingId: 'binding:one',
    contractRef: model.contractRef, offeringRegistrationHash: 'offering-hash:one',
    bindingRegistrationHash: 'binding-hash:one',
  }
  const compiled = compileCustomerRequest({
    requestId: 'request:protected:1', expectedRevision: 0,
    principalId: 'principal:customer', delegatedAgentId: 'agent:customer',
    intent: 'Find an option to Perth', networkId: 'ae:public', interpreterId: 'test:interpreter',
    bindings: [binding], models: [model], now: 1_000,
    proposal: {
      kind: 'capability_candidates',
      selections: [{
        selectionKey: model.selectionKey, contractRef: model.contractRef,
        facts: [{
          contractRef: model.contractRef, selectionKey: model.selectionKey,
          inputKey: destination.key, inputPointer: destination.inputPointer,
          schemaIdentity: destination.schemaIdentity, value: 'Perth',
          source: { kind: 'customer', assertionRef: 'assertion:destination' },
        }],
      }],
    },
  })
  if (compiled.kind !== 'compiled') throw new Error(compiled.reason)
  const actionId = compiled.aggregate.plan.actions[0]?.actionId
  if (actionId === undefined) throw new Error('action missing')
  return { aggregate: compiled.aggregate, model, actionId }
}

function protectedContract() {
  return {
    contractFormat: 'ae.capability-contract:v2', capabilityId: 'test.destination.lookup', version: 1,
    name: 'Destination lookup', description: 'Find a registered option for a destination.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { destination: { type: 'string', minLength: 1 } },
      required: ['destination'], additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'destination', document: 'input', pointer: '/destination', label: 'Destination', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [{
      effectId: 'destination_release', inputPointer: '/destination', classification: 'personal',
      phase: 'preparation', recipient: { kind: 'candidate_binding' }, purposes: ['compare_options'],
    }],
    effects: [{
      effectId: 'destination_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible',
    }],
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
  }
}
