import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

describe('capability preparation projection', () => {
  it('owns commitment input, disclosure, and linked effect authority for one exact action', () => {
    const model = preparationModel()
    const request = requiredInput(model, 'request')
    const approval = requiredInput(model, 'approval')

    const projection = model.projectPreparation({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      facts: [
        { input: request.key, inputPointer: request.inputPointer, value: 'Find a suitable result' },
        { input: approval.key, inputPointer: approval.inputPointer, value: 'A123' },
      ],
    })
    if (projection.kind !== 'ready') throw new Error('expected ready preparation projection')

    expect(projection).toEqual({
      kind: 'ready',
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      input: { request: 'Find a suitable result', approval: { code: 'A123' } },
      dataUse: [
        {
          declarationKey: expect.stringMatching(/^ae_data_use:sha256:[a-f0-9]{64}$/),
          effectId: 'approval_release',
          inputPointer: '/approval',
          schemaIdentity: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          classification: 'credential',
          phase: 'execution',
          recipient: { kind: 'selected_binding' },
          purposes: ['confirm_customer_authority'],
          effect: {
            effectId: 'approval_release',
            class: 'data_release',
            authority: 'explicit',
            reversibility: 'irreversible',
          },
          inputs: [{
            inputKey: approval.key,
            inputPointer: approval.inputPointer,
            label: approval.label,
            schemaIdentity: approval.schemaIdentity,
          }],
        },
        {
          declarationKey: expect.stringMatching(/^ae_data_use:sha256:[a-f0-9]{64}$/),
          effectId: 'request_release',
          inputPointer: '/request',
          schemaIdentity: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          classification: 'personal',
          phase: 'preparation',
          recipient: { kind: 'candidate_binding' },
          purposes: ['prepare_customer_options'],
          effect: {
            effectId: 'request_release',
            class: 'data_release',
            authority: 'mandate_or_explicit',
            reversibility: 'irreversible',
          },
          inputs: [{
            inputKey: request.key,
            inputPointer: request.inputPointer,
            label: request.label,
            schemaIdentity: request.schemaIdentity,
          }],
        },
      ],
    })
    expect(Object.isFrozen(projection)).toBe(true)
    expect(Object.isFrozen(projection.dataUse)).toBe(true)
  })

  it('returns exact typed missing-information and incompatibility results', () => {
    const model = preparationModel()
    const request = requiredInput(model, 'request')
    const approval = requiredInput(model, 'approval')
    const exact = {
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
    }

    expect(model.projectPreparation({
      ...exact,
      facts: [{ input: request.key, inputPointer: request.inputPointer, value: 'Find a suitable result' }],
    })).toEqual({
      kind: 'needs_information',
      ...exact,
      missing: [approval],
      dataUse: expect.arrayContaining([
        expect.objectContaining({
          effectId: 'approval_release',
          classification: 'credential',
          inputs: [expect.objectContaining({ inputKey: approval.key, label: 'Approval code' })],
        }),
      ]),
    })

    expect(model.projectPreparation({
      ...exact,
      semanticDigest: `sha256:${'0'.repeat(64)}`,
      facts: [],
    })).toEqual({
      kind: 'incompatible',
      ...exact,
      issues: [{ keyword: 'semantic_digest_mismatch' }],
    })

    expect(model.projectPreparation({
      ...exact,
      facts: [{ input: request.key, inputPointer: request.inputPointer, value: 42 }],
    })).toEqual({
      kind: 'incompatible',
      ...exact,
      issues: [{ inputPointer: '/request', keyword: 'value_invalid' }],
    })
  })

  it('changes preparation semantics by contract registration alone', () => {
    const first = preparationModel()
    const second = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      capabilityId: 'reference.alternate',
      dataUse: [{
        effectId: 'request_release',
        inputPointer: '/request',
        classification: 'public',
        phase: 'execution',
        recipient: { kind: 'named_recipient', recipientId: 'public-index' },
        purposes: ['return_public_record'],
      }],
      effects: [{
        effectId: 'request_release',
        class: 'data_release',
        authority: 'explicit',
        reversibility: 'not_applicable',
      }],
    })))
    const firstRequest = requiredInput(first, 'request')
    const firstApproval = requiredInput(first, 'approval')
    const secondRequest = requiredInput(second, 'request')

    const firstProjection = first.projectPreparation({
      contractRef: first.contractRef,
      selectionKey: first.selectionKey,
      semanticDigest: first.semanticDigest,
      facts: [
        { input: firstRequest.key, inputPointer: firstRequest.inputPointer, value: 'private request' },
        { input: firstApproval.key, inputPointer: firstApproval.inputPointer, value: 'A123' },
      ],
    })
    const secondProjection = second.projectPreparation({
      contractRef: second.contractRef,
      selectionKey: second.selectionKey,
      semanticDigest: second.semanticDigest,
      facts: [{ input: secondRequest.key, inputPointer: secondRequest.inputPointer, value: 'public record' }],
    })

    expect(firstProjection.kind === 'ready' && firstProjection.dataUse.map((use) => use.classification)).toEqual(['credential', 'personal'])
    expect(secondProjection.kind === 'ready' && secondProjection.dataUse).toEqual([
      expect.objectContaining({
        classification: 'public',
        recipient: { kind: 'named_recipient', recipientId: 'public-index' },
        purposes: ['return_public_record'],
        effect: expect.objectContaining({ authority: 'explicit', reversibility: 'not_applicable' }),
      }),
    ])
  })

  it('derives exact stable identities from the registered declaration and pointed schema', () => {
    const contract = defineCapabilityContract(capabilityContractV2())
    const first = openCapabilityDecisionModel(contract)
    const second = openCapabilityDecisionModel(contract)
    const request = requiredInput(first, 'request')
    const projection = first.projectPreparation({
      contractRef: first.contractRef,
      selectionKey: first.selectionKey,
      semanticDigest: first.semanticDigest,
      facts: [{ input: request.key, inputPointer: request.inputPointer, value: 'public record' }],
    })
    const reopenedRequest = requiredInput(second, 'request')
    const reopenedProjection = second.projectPreparation({
      contractRef: second.contractRef,
      selectionKey: second.selectionKey,
      semanticDigest: second.semanticDigest,
      facts: [{ input: reopenedRequest.key, inputPointer: reopenedRequest.inputPointer, value: 'public record' }],
    })
    if (projection.kind !== 'ready' || reopenedProjection.kind !== 'ready') throw new Error('expected ready projection')
    const declaration = contract.dataUse[0]
    if (declaration === undefined) throw new Error('expected registered declaration')

    expect(projection.dataUse[0]?.schemaIdentity).toBe(request.schemaIdentity)
    expect(projection.dataUse[0]?.declarationKey).toBe(`ae_data_use:${canonicalDigest({
      contractRef: contract.ref,
      declaration,
    } as StableHashValue)}`)
    expect(reopenedProjection.dataUse[0]?.declarationKey).toBe(projection.dataUse[0]?.declarationKey)
    expect(reopenedProjection.dataUse[0]?.schemaIdentity).toBe(projection.dataUse[0]?.schemaIdentity)
  })

  it('rejects duplicate registered data-use declarations before identities are projected', () => {
    const base = capabilityContractV2()
    const declaration = base.dataUse[0]

    expect(() => defineCapabilityContract({
      ...base,
      dataUse: [declaration, declaration],
    })).toThrowError('capability_data_use_duplicate')
  })

  it('does not project an absent optional child covered by a parent declaration', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      inputSchema: objectSchema({
        contact: {
          type: 'object',
          properties: {
            email: { type: 'string', minLength: 1 },
            phone: { type: 'string', minLength: 1 },
          },
          required: ['email'],
          additionalProperties: false,
        },
      }, ['contact']),
      customerAnnotations: [
        { annotationId: 'email', document: 'input', pointer: '/contact/email', label: 'Email', role: 'request' },
        { annotationId: 'phone', document: 'input', pointer: '/contact/phone', label: 'Phone', role: 'commitment' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [{
        effectId: 'contact_release', inputPointer: '/contact', classification: 'personal', phase: 'preparation',
        recipient: { kind: 'candidate_binding' }, purposes: ['prepare_customer_options'],
      }],
      effects: [{
        effectId: 'contact_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible',
      }],
    })))
    const email = requiredInput(model, 'email')
    const projection = model.projectPreparation({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      facts: [{ input: email.key, inputPointer: email.inputPointer, value: 'customer@example.test' }],
    })
    if (projection.kind !== 'ready') throw new Error('expected ready projection')

    expect(projection.dataUse).toEqual([
      expect.objectContaining({
        inputPointer: '/contact',
        inputs: [expect.objectContaining({ inputKey: email.key, label: 'Email' })],
      }),
    ])
  })
})

function preparationModel() {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    inputSchema: objectSchema({
      request: { type: 'string', minLength: 1 },
      approval: {
        type: 'object',
        properties: { code: { type: 'string', minLength: 4 } },
        required: ['code'],
        additionalProperties: false,
      },
    }, ['request', 'approval']),
    customerAnnotations: [
      { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
      { annotationId: 'approval', document: 'input', pointer: '/approval/code', label: 'Approval code', role: 'commitment' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [
      {
        effectId: 'request_release', inputPointer: '/request', classification: 'personal', phase: 'preparation',
        recipient: { kind: 'candidate_binding' }, purposes: ['prepare_customer_options'],
      },
      {
        effectId: 'approval_release', inputPointer: '/approval', classification: 'credential', phase: 'execution',
        recipient: { kind: 'selected_binding' }, purposes: ['confirm_customer_authority'],
      },
    ],
    effects: [
      { effectId: 'request_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' },
      { effectId: 'approval_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' },
    ],
  })))
}

function requiredInput(model: CapabilityDecisionModel, annotationId: string) {
  const input = model.inputs.find((candidate) => candidate.annotationId === annotationId)
  if (input === undefined) throw new Error(`missing test input: ${annotationId}`)
  return input
}

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}
