import { describe, expect, it } from 'vitest'

import { defineCapabilityContract } from '@/modules/capability-contract/public'

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema' as const

describe('function-agnostic capability contract', () => {
  it('describes dissimilar capabilities through one contract without an operation vocabulary', () => {
    const contracts = [
      defineCapabilityContract({
        contractFormat: 'ae.capability-contract:v2',
        capabilityId: 'market-data.asset-snapshot',
        version: 1,
        name: 'Asset snapshot',
        description: 'Return a current market-data snapshot for one asset.',
        inputSchema: objectSchema({ symbol: { type: 'string', minLength: 1 } }, ['symbol']),
        outputSchema: objectSchema({ price: { type: 'number' }, observedAt: { type: 'string', format: 'date-time' } }, ['price', 'observedAt']),
        customerAnnotations: [
          { annotationId: 'asset', document: 'input', pointer: '/symbol', label: 'Asset', role: 'request' },
          { annotationId: 'price', document: 'output', pointer: '/price', label: 'Current price', role: 'completion_evidence' },
        ],
        dataUse: [{ effectId: 'symbol_release', inputPointer: '/symbol', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_current_snapshot'] }],
        effects: [
          { effectId: 'symbol_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' },
          { effectId: 'charge', class: 'financial_exposure', authority: 'mandate_or_explicit', reversibility: 'conditional' },
        ],
        evidence: [{ evidenceId: 'snapshot', outputPointer: '/price', purpose: 'completion' }],
        lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
      }),
      defineCapabilityContract({
        contractFormat: 'ae.capability-contract:v2',
        capabilityId: 'research.synthesize',
        version: 1,
        name: 'Research synthesis',
        description: 'Produce a research synthesis from a question.',
        inputSchema: objectSchema({ question: { type: 'string', minLength: 1 } }, ['question']),
        outputSchema: objectSchema({ report: { type: 'string' }, continuationToken: { type: 'string' } }, ['report']),
        customerAnnotations: [
          { annotationId: 'question', document: 'input', pointer: '/question', label: 'Research question', role: 'request' },
          { annotationId: 'report', document: 'output', pointer: '/report', label: 'Research report', role: 'completion_evidence' },
        ],
        dataUse: [{ effectId: 'question_release', inputPointer: '/question', classification: 'personal', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['produce_requested_result'] }],
        effects: [
          { effectId: 'question_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' },
          { effectId: 'charge', class: 'financial_exposure', authority: 'mandate_or_explicit', reversibility: 'conditional' },
        ],
        evidence: [{ evidenceId: 'report', outputPointer: '/report', purpose: 'completion' }],
        lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
      }),
      defineCapabilityContract({
        contractFormat: 'ae.capability-contract:v2',
        capabilityId: 'calendar.create-reservation',
        version: 1,
        name: 'Create reservation',
        description: 'Create a reservation for a requested time.',
        inputSchema: objectSchema({ startsAt: { type: 'string', format: 'date-time' }, attendeeEmail: { type: 'string', format: 'email' } }, ['startsAt', 'attendeeEmail']),
        outputSchema: objectSchema({ reservationId: { type: 'string' }, status: { type: 'string' } }, ['reservationId', 'status']),
        customerAnnotations: [
          { annotationId: 'time', document: 'input', pointer: '/startsAt', label: 'Start time', role: 'constraint' },
          { annotationId: 'attendee', document: 'input', pointer: '/attendeeEmail', label: 'Attendee email', role: 'commitment' },
          { annotationId: 'reservation', document: 'output', pointer: '/reservationId', label: 'Reservation', role: 'completion_evidence' },
        ],
        dataUse: [
          { effectId: 'time_release', inputPointer: '/startsAt', classification: 'personal', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['create_requested_result'] },
          { effectId: 'attendee_release', inputPointer: '/attendeeEmail', classification: 'personal', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['create_requested_result'] },
        ],
        effects: [
          { effectId: 'time_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' },
          { effectId: 'attendee_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' },
          { effectId: 'reservation', class: 'external_state_change', authority: 'explicit', reversibility: 'conditional' },
        ],
        evidence: [{ evidenceId: 'reservation', outputPointer: '/reservationId', purpose: 'completion' }],
        lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
      }),
    ]

    expect(contracts.map((contract) => contract.ref)).toEqual([
      { capabilityId: 'market-data.asset-snapshot', version: 1, contractDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      { capabilityId: 'research.synthesize', version: 1, contractDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      { capabilityId: 'calendar.create-reservation', version: 1, contractDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
    ])
    for (const contract of contracts) {
      expect(contract).not.toHaveProperty('operation')
      expect(contract).not.toHaveProperty('providerAffinity')
      expect(contract).not.toHaveProperty('pricing')
      expect(contract.lifecycle).not.toHaveProperty('continuation')
    }
  })

  it('rejects remote schema references instead of fetching registrant-controlled definitions', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: {
        $schema: JSON_SCHEMA_2020_12,
        $ref: 'https://untrusted.example/capability-input.json',
      },
    })).toThrowError('capability_contract_invalid')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: { $schema: JSON_SCHEMA_2020_12, $dynamicRef: 'https://untrusted.example/dynamic' },
    })).toThrowError('capability_contract_invalid')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: { $schema: JSON_SCHEMA_2020_12, $dynamicAnchor: 'node', $dynamicRef: '#node' },
    })).toThrowError('capability_contract_invalid')
  })

  it('does not mistake instance data containing $ref for a schema reference', () => {
    const contract = defineCapabilityContract({
      ...minimalContract(),
      inputSchema: objectSchema({ id: { const: { $ref: 'https://example.test/instance-value' } } }, ['id']),
    })

    expect(contract.inputSchema).toHaveProperty('properties.id.const.$ref', 'https://example.test/instance-value')
  })

  it('rejects material effects that declare no authority', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      effects: [{
        effectId: 'external_change',
        class: 'external_state_change',
        authority: 'none',
        reversibility: 'irreversible',
      }],
    })).toThrowError('capability_material_effect_requires_authority')
  })

  it('rejects data use that is not bound to a declared data-release effect', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      dataUse: [{
        effectId: 'undeclared_release',
        inputPointer: '/id',
        classification: 'personal',
        phase: 'execution',
        recipient: { kind: 'selected_binding' },
        purposes: ['produce_requested_result'],
      }],
    })).toThrowError('capability_data_use_effect_not_declared')
  })

  it('rejects a declared data-release effect with no matching data-use declaration', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      effects: [...minimalContract().effects, { effectId: 'hidden_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' }],
    })).toThrowError('capability_data_effect_use_not_declared')
  })

  it('rejects customer input without an explicit disclosure declaration', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      dataUse: [],
      effects: [],
    })).toThrowError('capability_input_disclosure_undeclared')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: objectSchema({ id: { type: 'string' }, hidden: { type: 'string' } }, ['id']),
    })).toThrowError('capability_input_disclosure_undeclared')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: {
        ...minimalContract().inputSchema,
        patternProperties: { '^dynamic_': { type: 'string' } },
      },
    })).toThrowError('capability_input_schema_profile_invalid')
  })

  it('rejects evidence and data declarations that point outside their schemas', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      evidence: [{ evidenceId: 'missing', outputPointer: '/notDeclared', purpose: 'completion' }],
    })).toThrowError('capability_evidence_pointer_invalid')
  })

  it('rejects malformed schemas even when they are JSON objects', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: { $schema: JSON_SCHEMA_2020_12, type: 'not-a-json-schema-type' },
    })).toThrowError('capability_json_schema_invalid')
  })

  it('accepts bounded local references and resolves customer pointers through them', () => {
    const contract = defineCapabilityContract({
      ...minimalContract(),
      inputSchema: {
        $schema: JSON_SCHEMA_2020_12,
        $defs: { request: objectSchema({ id: { type: 'string' } }, ['id']) },
        $ref: '#/$defs/request',
      },
    })

    expect(contract.customerAnnotations[0]?.pointer).toBe('/id')
  })

  it('projects bounded array inputs without requiring item-specific facts', () => {
    const contract = defineCapabilityContract({
      ...minimalContract(),
      inputSchema: objectSchema({
        records: { type: 'array', maxItems: 10, items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      }, ['records']),
      customerAnnotations: [
        { annotationId: 'records', document: 'input', pointer: '/records', label: 'Records', role: 'request' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [{ effectId: 'records_release', inputPointer: '/records', classification: 'personal', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_requested_results'] }],
      effects: [{ effectId: 'records_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' }],
    })

    expect(contract.customerAnnotations[0]?.pointer).toBe('/records')
  })

  it('rejects non-canonical JSON Pointer escapes and array-index aliases', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      customerAnnotations: [
        { annotationId: 'identifier', document: 'input', pointer: '/id~2alias', label: 'Identifier', role: 'request' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
    })).toThrowError('capability_contract_invalid')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: objectSchema({ records: { type: 'array', items: { type: 'string' } } }, ['records']),
      customerAnnotations: [
        { annotationId: 'record', document: 'input', pointer: '/records/01', label: 'Record', role: 'request' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
      ],
      dataUse: [{ effectId: 'records_release', inputPointer: '/records', classification: 'personal', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_requested_results'] }],
      effects: [{ effectId: 'records_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' }],
    })).toThrowError('capability_customer_annotation_pointer_invalid')
  })

  it('rejects duplicate semantic identifiers', () => {
    const duplicateEffect = { effectId: 'charge', class: 'financial_exposure', authority: 'explicit', reversibility: 'conditional' } as const
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      effects: [duplicateEffect, duplicateEffect],
    })).toThrowError('capability_semantic_id_duplicate')
  })

  it('rejects customer annotations that point outside the declared document', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      customerAnnotations: [{ annotationId: 'missing', document: 'input', pointer: '/missing', label: 'Missing', role: 'request' }],
    })).toThrowError('capability_customer_annotation_pointer_invalid')
  })

  it('requires completion evidence to be guaranteed and customer-labelled as completion evidence', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'comparison' }],
    })).toThrowError('capability_completion_evidence_missing')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      customerAnnotations: [
        { annotationId: 'identifier', document: 'input', pointer: '/id', label: 'Identifier', role: 'request' },
        { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'result' },
      ],
    })).toThrowError('capability_completion_evidence_annotation_missing')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      outputSchema: objectSchema({ result: { type: 'string' } }, []),
    })).toThrowError('capability_completion_evidence_not_guaranteed')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      outputSchema: {
        $schema: JSON_SCHEMA_2020_12,
        type: ['object', 'null'],
        properties: { result: { type: 'string' } },
        required: ['result'],
      },
    })).toThrowError('capability_completion_evidence_not_guaranteed')

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      outputSchema: {
        $schema: JSON_SCHEMA_2020_12,
        anyOf: [
          { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] },
          { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        ],
      },
    })).toThrowError('capability_completion_evidence_not_guaranteed')
  })

  it('rejects inconsistent lifecycle combinations', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      lifecycle: { idempotency: 'not_applicable', recovery: 'retry_safe' },
    })).toThrowError('capability_lifecycle_inconsistent')
  })

  it('bounds registrant-controlled schema depth', () => {
    let nested: Record<string, unknown> = { type: 'string' }
    for (let index = 0; index < 70; index += 1) nested = { type: 'array', items: nested }

    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: { $schema: JSON_SCHEMA_2020_12, ...nested },
    })).toThrowError('capability_json_schema_too_complex')
  })

  it('bounds registrant-controlled schema size', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: objectSchema({ id: { const: 'x'.repeat(140_000) } }, ['id']),
    })).toThrowError('capability_json_schema_too_complex')
  })

  it('rejects recursive local-reference schemas with unbounded instance depth', () => {
    expect(() => defineCapabilityContract({
      ...minimalContract(),
      inputSchema: {
        $schema: JSON_SCHEMA_2020_12,
        $defs: {
          node: {
            type: 'object',
            properties: { id: { type: 'string' }, next: { $ref: '#/$defs/node' } },
            required: ['id'],
          },
        },
        $ref: '#/$defs/node',
      },
    })).toThrowError('capability_json_schema_too_complex')
  })

  it('produces a deterministic digest and changes it for material contract changes', () => {
    const original = defineCapabilityContract(minimalContract())
    const repeated = defineCapabilityContract(structuredClone(minimalContract()))
    const changedDocuments = [
      { ...minimalContract(), version: 2 },
      { ...minimalContract(), description: 'Return a verified result for one identifier.' },
      { ...minimalContract(), inputSchema: objectSchema({ id: { type: 'string', minLength: 2 } }, ['id']) },
      { ...minimalContract(), customerAnnotations: minimalContract().customerAnnotations.map((annotation) => ({ ...annotation, label: `${annotation.label} value` })) },
      { ...minimalContract(), effects: [...minimalContract().effects, { effectId: 'change', class: 'external_state_change', authority: 'explicit', reversibility: 'reversible' }] },
      { ...minimalContract(), evidence: [{ evidenceId: 'verified_result', outputPointer: '/result', purpose: 'completion' }] },
      { ...minimalContract(), lifecycle: { idempotency: 'required', recovery: 'reconcile_required' } },
    ] as const

    expect(repeated.ref).toEqual(original.ref)
    expect(changedDocuments.map((document) => defineCapabilityContract(document).ref.contractDigest)).not.toContain(original.ref.contractDigest)
  })
})

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    $schema: JSON_SCHEMA_2020_12,
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  } as const
}

function minimalContract() {
  return {
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: 'data.lookup',
    version: 1,
    name: 'Data lookup',
    description: 'Return data for one identifier.',
    inputSchema: objectSchema({ id: { type: 'string' } }, ['id']),
    outputSchema: objectSchema({ result: { type: 'string' } }, ['result']),
    customerAnnotations: [
      { annotationId: 'identifier', document: 'input', pointer: '/id', label: 'Identifier', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [{ effectId: 'identifier_release', inputPointer: '/id', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_requested_result'] }],
    effects: [{ effectId: 'identifier_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' }],
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
  } as const
}
