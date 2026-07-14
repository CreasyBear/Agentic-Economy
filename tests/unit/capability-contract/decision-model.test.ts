import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  projectCapabilityInputValueSchemas,
  sameCapabilityContractRef,
  samePointedSchema,
} from '@/modules/capability-contract/public'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

describe('capability decision model', () => {
  it('projects immutable staged input and evidence semantics from the exact contract', () => {
    const contract = defineCapabilityContract(capabilityContractV2({
      inputSchema: objectSchema({
        request: { type: 'string', minLength: 1 },
        approvalCode: { type: 'string', minLength: 4 },
      }, ['request', 'approvalCode']),
      customerAnnotations: [
        { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
        { annotationId: 'approval', document: 'input', pointer: '/approvalCode', label: 'Approval code', role: 'commitment' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [
        dataUse('request_release', '/request'),
        dataUse('approval_release', '/approvalCode'),
      ],
      effects: [
        dataEffect('request_release'),
        dataEffect('approval_release'),
      ],
    }))

    const model = openCapabilityDecisionModel(contract)

    expect(model.contractRef).toEqual(contract.ref)
    expect(model.selectionKey).toMatch(/^ae_selection:/)
    expect(model.semanticDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(model.inputs).toEqual([
      expect.objectContaining({ annotationId: 'approval', inputPointer: '/approvalCode', stage: 'commitment', required: true }),
      expect.objectContaining({ annotationId: 'request', inputPointer: '/request', stage: 'option_selection', required: true }),
    ])
    expect(model.evidence).toEqual([
      expect.objectContaining({ evidenceId: 'result', outputPointer: '/result', label: 'Result', guaranteed: true }),
    ])
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.inputs)).toBe(true)
  })

  it('refuses a forged contract reference instead of treating TypeScript shape as authority', () => {
    const contract = defineCapabilityContract(capabilityContractV2())
    const forged = { ...contract, ref: { ...contract.ref, contractDigest: `sha256:${'0'.repeat(64)}` } }

    expect(() => openCapabilityDecisionModel(forged)).toThrowError('capability_contract_ref_mismatch')
  })

  it('bounds cumulative input projections when local references expand the same schema repeatedly', () => {
    const sharedSchema = { type: 'string', minLength: 1, examples: ['x'.repeat(256)] }
    const contract = defineCapabilityContract(capabilityContractV2({
      inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        $defs: { shared: sharedSchema },
        properties: { first: { $ref: '#/$defs/shared' }, second: { $ref: '#/$defs/shared' } },
        required: ['first', 'second'],
        additionalProperties: false,
      },
      customerAnnotations: [
        { annotationId: 'first', document: 'input', pointer: '/first', label: 'First', role: 'request' },
        { annotationId: 'second', document: 'input', pointer: '/second', label: 'Second', role: 'constraint' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [dataUse('first_release', '/first'), dataUse('second_release', '/second')],
      effects: [dataEffect('first_release'), dataEffect('second_release')],
    }))
    const model = openCapabilityDecisionModel(contract)
    const first = requiredInput(model, 'first')
    const firstProjection = {
      inputKey: first.key,
      valueSchema: projectCapabilityInputValueSchema(contract.inputSchema, first),
    }
    const oneProjectionBytes = new TextEncoder().encode(JSON.stringify(firstProjection)).byteLength

    expect(model.inputs.map((input) => projectCapabilityInputValueSchema(contract.inputSchema, input))).toEqual([
      sharedSchema,
      sharedSchema,
    ])
    expect(() => projectCapabilityInputValueSchemas(
      contract.inputSchema,
      model.inputs,
      oneProjectionBytes,
    )).toThrow('capability_input_schema_projection_too_large')
  })

  it('rejects contracts whose required customer input cannot be projected unambiguously', () => {
    expect(() => defineCapabilityContract(capabilityContractV2({
      inputSchema: objectSchema({ request: { type: 'string' }, hidden: { type: 'string' } }, ['request', 'hidden']),
      dataUse: [
        dataUse('request_release', '/request'),
        dataUse('hidden_release', '/hidden'),
      ],
      effects: [
        dataEffect('request_release'),
        dataEffect('hidden_release'),
      ],
    }))).toThrowError('capability_required_input_annotation_missing')

    expect(() => defineCapabilityContract(capabilityContractV2({
      customerAnnotations: [
        { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
        { annotationId: 'request_again', document: 'input', pointer: '/request', label: 'Request again', role: 'constraint' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
    }))).toThrowError('capability_customer_annotation_pointer_ambiguous')

    expect(() => defineCapabilityContract(capabilityContractV2({
      inputSchema: objectSchema({
        profile: {
          type: 'object',
          properties: { name: { type: 'string' }, email: { type: 'string' } },
          required: ['name', 'email'],
          additionalProperties: false,
        },
      }, ['profile']),
      customerAnnotations: [
        { annotationId: 'name', document: 'input', pointer: '/profile/name', label: 'Name', role: 'request' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [dataUse('profile_release', '/profile')],
      effects: [dataEffect('profile_release')],
    }))).toThrowError('capability_required_input_annotation_missing')
  })

  it('rejects annotation roles assigned to the wrong document', () => {
    expect(() => defineCapabilityContract(capabilityContractV2({
      customerAnnotations: [
        { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'result' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
    }))).toThrowError('capability_customer_annotation_role_invalid')

    expect(() => defineCapabilityContract(capabilityContractV2({
      outputSchema: objectSchema({ result: { type: 'string' }, recovery: { type: 'string' } }, ['result']),
      customerAnnotations: [
        { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
        { annotationId: 'recovery', document: 'output', pointer: '/recovery', label: 'Recovery', role: 'result' },
      ],
      evidence: [
        { evidenceId: 'result', outputPointer: '/result', purpose: 'completion' },
        { evidenceId: 'recovery', outputPointer: '/recovery', purpose: 'recovery' },
      ],
    }))).toThrowError('capability_evidence_annotation_invalid')
  })

  it('separates option-selection viability from commitment readiness', () => {
    const model = modelWithCommitment()
    const request = requiredInput(model, 'request')
    const approval = requiredInput(model, 'approval')
    const requestFact = { input: request.key, inputPointer: request.inputPointer, value: 'Find a match' }

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'option_selection',
      facts: [requestFact],
    })).toEqual({ kind: 'viable', stage: 'option_selection' })

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'commitment',
      facts: [requestFact],
    })).toEqual({ kind: 'needs_information', missing: [approval] })

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'commitment',
      facts: [
        requestFact,
        { input: approval.key, inputPointer: approval.inputPointer, value: 'A123' },
      ],
    })).toEqual({
      kind: 'viable',
      stage: 'commitment',
      input: { request: 'Find a match', approvalCode: 'A123' },
    })
  })

  it('treats invalid or incorrectly scoped supplied facts as incompatible without coercion', () => {
    const model = modelWithCommitment()
    const request = requiredInput(model, 'request')
    const wrongRef = { ...model.contractRef, version: model.contractRef.version + 1 }

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'option_selection',
      facts: [{ input: request.key, inputPointer: request.inputPointer, value: 42 }],
    })).toEqual(expect.objectContaining({ kind: 'incompatible' }))

    expect(model.assessInput({
      contractRef: wrongRef,
      selectionKey: model.selectionKey,
      stage: 'option_selection',
      facts: [],
    })).toEqual({ kind: 'incompatible', issues: [{ keyword: 'contract_ref_mismatch' }] })

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'option_selection',
      facts: [{ input: request.key, inputPointer: '/other', value: 'Find a match' }],
    })).toEqual({ kind: 'incompatible', issues: [{ inputPointer: '/other', keyword: 'input_scope_mismatch' }] })
  })

  it('rejects invalid fact combinations during option selection while ignoring only absent commitment input', () => {
    expect(() => defineCapabilityContract(capabilityContractV2({
      inputSchema: {
        ...objectSchema({ request: { type: 'string' }, approvalCode: { type: 'string' } }, ['request']),
        dependentRequired: { request: ['approvalCode'] },
      },
    }))).toThrowError('capability_input_schema_projection_invalid')

    expect(() => defineCapabilityContract(capabilityContractV2({
      inputSchema: {
        ...objectSchema({ request: { type: 'string' } }, ['request']),
        const: { request: 'only-this-complete-object' },
      },
    }))).toThrowError('capability_input_schema_projection_invalid')

    expect(() => defineCapabilityContract(capabilityContractV2({
      inputSchema: objectSchema({
        profile: {
          type: 'object',
          properties: { name: { type: 'string' }, email: { type: 'string' } },
          required: ['name'],
          dependentRequired: { name: ['email'] },
          additionalProperties: false,
        },
      }, ['profile']),
      customerAnnotations: [
        { annotationId: 'name', document: 'input', pointer: '/profile/name', label: 'Name', role: 'request' },
        { annotationId: 'email', document: 'input', pointer: '/profile/email', label: 'Email', role: 'commitment' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [dataUse('profile_release', '/profile')],
      effects: [dataEffect('profile_release')],
    }))).toThrowError('capability_input_schema_projection_invalid')
  })

  it('materializes sibling facts without overwriting and does not freeze caller-owned values', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      inputSchema: objectSchema({
        profile: {
          type: 'object',
          properties: { name: { type: 'string' }, email: { type: 'string' } },
          required: ['name', 'email'],
          additionalProperties: false,
        },
      }, ['profile']),
      customerAnnotations: [
        { annotationId: 'name', document: 'input', pointer: '/profile/name', label: 'Name', role: 'request' },
        { annotationId: 'email', document: 'input', pointer: '/profile/email', label: 'Email', role: 'commitment' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [dataUse('profile_release', '/profile')],
      effects: [dataEffect('profile_release')],
    })))
    const name = requiredInput(model, 'name')
    const email = requiredInput(model, 'email')

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'commitment',
      facts: [
        { input: name.key, inputPointer: name.inputPointer, value: 'Ada' },
        { input: email.key, inputPointer: email.inputPointer, value: 'ada@example.test' },
      ],
    })).toEqual({
      kind: 'viable',
      stage: 'commitment',
      input: { profile: { name: 'Ada', email: 'ada@example.test' } },
    })
  })

  it('validates whole input and output documents without modifying submitted data', () => {
    const model = modelWithCommitment()
    const input = { request: 42, approvalCode: 'A123', extra: true }
    const output = { result: 42 }

    expect(model.validateInput(input)).toEqual(expect.objectContaining({ kind: 'invalid', truncated: false }))
    expect(model.validateOutput(output)).toEqual(expect.objectContaining({ kind: 'invalid', truncated: false }))
    expect(input).toEqual({ request: 42, approvalCode: 'A123', extra: true })
    expect(output).toEqual({ result: 42 })

    const valid = { request: 'Find a match', approvalCode: 'A123' }
    const validated = model.validateInput(valid)
    expect(validated).toEqual({ kind: 'valid', value: valid })
    expect(validated.kind === 'valid' && validated.value).not.toBe(valid)
    expect(Object.isFrozen(valid)).toBe(false)
  })

  it('compares canonical pointed schemas rather than labels or pointers', () => {
    const first = modelWithCommitment()
    const sameShape = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      capabilityId: 'reference.other',
      customerAnnotations: [
        { annotationId: 'different_name', document: 'input', pointer: '/request', label: 'Different label', role: 'constraint' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
    })))
    const differentShape = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      capabilityId: 'reference.constrained',
      inputSchema: objectSchema({ request: { type: 'string', minLength: 8 } }, ['request']),
    })))

    expect(samePointedSchema(requiredInput(first, 'request').schemaIdentity, requiredInput(sameShape, 'different_name').schemaIdentity)).toBe(true)
    expect(samePointedSchema(requiredInput(first, 'request').schemaIdentity, requiredInput(differentShape, 'request').schemaIdentity)).toBe(false)
  })

  it('resolves local references before comparing pointed schemas', () => {
    const direct = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2()))
    const referenced = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      capabilityId: 'reference.indirect',
      inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $defs: { requestValue: { type: 'string', minLength: 1 } },
        type: 'object',
        properties: { request: { $ref: '#/$defs/requestValue' } },
        required: ['request'],
        additionalProperties: false,
      },
    })))

    expect(samePointedSchema(requiredInput(direct, 'request').schemaIdentity, requiredInput(referenced, 'request').schemaIdentity)).toBe(true)
  })

  it('resolves nested local references and preserves reference siblings in pointed validation', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      capabilityId: 'reference.nested',
      inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $defs: {
          text: { type: 'string' },
          requestValue: { $ref: '#/$defs/text', type: 'string', minLength: 3 },
        },
        type: 'object',
        properties: { request: { $ref: '#/$defs/requestValue' } },
        required: ['request'],
        additionalProperties: false,
      },
    })))
    const request = requiredInput(model, 'request')

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'option_selection',
      facts: [{ input: request.key, inputPointer: request.inputPointer, value: 'no' }],
    })).toEqual(expect.objectContaining({ kind: 'incompatible' }))
  })

  it('rejects cyclic runtime values safely and keeps cache eviction behaviorally invisible', () => {
    const model = modelWithCommitment()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(model.validateInput(cyclic)).toEqual({
      kind: 'invalid',
      issues: [{ instancePointer: '', keyword: 'value_too_complex' }],
      truncated: false,
    })

    const request = requiredInput(model, 'request')
    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'option_selection',
      facts: [{ input: request.key, inputPointer: request.inputPointer, value: cyclic as never }],
    })).toEqual({
      kind: 'incompatible',
      issues: [{ inputPointer: '/request', keyword: 'value_too_complex' }],
    })

    expect(model.assessInput({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      stage: 'option_selection',
      facts: Array.from({ length: 129 }, () => ({ input: request.key, inputPointer: request.inputPointer, value: 'value' })),
    })).toEqual({ kind: 'incompatible', issues: [{ keyword: 'fact_limit_exceeded' }] })

    for (let index = 0; index < 40; index += 1) {
      const candidate = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
        capabilityId: `reference.cache-${index}`,
      })))
      expect(candidate.validateInput({ request: 'value' })).toEqual({ kind: 'valid', value: { request: 'value' } })
    }
    expect(model.validateOutput({ result: 'still valid' })).toEqual({ kind: 'valid', value: { result: 'still valid' } })
  })

  it('changes exact identity, selection key, and semantic digest for material changes', () => {
    const original = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2()))
    const changed = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({ description: 'A materially different description.' })))

    expect(sameCapabilityContractRef(original.contractRef, changed.contractRef)).toBe(false)
    expect(changed.selectionKey).not.toBe(original.selectionKey)
    expect(changed.semanticDigest).not.toBe(original.semanticDigest)
  })

  it('preserves legacy semantic identity unless a registered input changes inference policy', () => {
    const legacyDocument = capabilityContractV2()
    const legacy = openCapabilityDecisionModel(defineCapabilityContract(legacyDocument))
    const customerRequired = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      customerAnnotations: legacyDocument.customerAnnotations.map((annotation) => (
        annotation.document === 'input' ? { ...annotation, inference: 'customer_required' } : annotation
      )),
    })))

    expect(legacy.inputs[0]?.inference).toBe('allowed')
    expect(legacy.semanticDigest).toBe('sha256:4750bf6cbc591afddd5b6937aace5f2c3b83587ca10b1a0f8aea0b53840baa11')
    expect(customerRequired.semanticDigest).not.toBe(legacy.semanticDigest)
  })
})

function modelWithCommitment() {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    inputSchema: objectSchema({
      request: { type: 'string', minLength: 1 },
      approvalCode: { type: 'string', minLength: 4 },
    }, ['request', 'approvalCode']),
    customerAnnotations: [
      { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
      { annotationId: 'approval', document: 'input', pointer: '/approvalCode', label: 'Approval code', role: 'commitment' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [dataUse('request_release', '/request'), dataUse('approval_release', '/approvalCode')],
    effects: [dataEffect('request_release'), dataEffect('approval_release')],
  })))
}

function requiredInput(model: ReturnType<typeof modelWithCommitment>, annotationId: string) {
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

function dataUse(effectId: string, inputPointer: string) {
  return {
    effectId,
    inputPointer,
    classification: 'personal',
    phase: 'execution',
    recipient: { kind: 'selected_binding' },
    purposes: ['return_requested_result'],
  }
}

function dataEffect(effectId: string) {
  return {
    effectId,
    class: 'data_release',
    authority: 'mandate_or_explicit',
    reversibility: 'irreversible',
  }
}
