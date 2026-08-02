export function capabilityContractV2(overrides: Record<string, unknown> = {}) {
  return {
    contractFormat: 'ae.capability-contract:v2' as const,
    capabilityId: 'reference.lookup',
    version: 1,
    name: 'Reference lookup',
    description: 'Return a referenced result for a structured request.',
    inputSchema: objectSchema({ request: { type: 'string', minLength: 1 } }, ['request']),
    outputSchema: objectSchema({ result: { type: 'string' } }, ['result']),
    customerAnnotations: [
      { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [{
      effectId: 'request_release',
      inputPointer: '/request',
      classification: 'personal',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['return_requested_result'],
    }],
    effects: [{
      effectId: 'request_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    }],
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
    ...overrides,
  }
}

export function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}
