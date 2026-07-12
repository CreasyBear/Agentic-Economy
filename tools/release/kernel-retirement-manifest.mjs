export const KERNEL_RETIREMENT_MANIFEST_VERSION = 'ae-kernel-retirement:v1'

export const kernelRetirementManifest = Object.freeze({
  schemaVersion: KERNEL_RETIREMENT_MANIFEST_VERSION,
  retired: Object.freeze({
    files: Object.freeze([
      'convex/clearance.ts',
      'convex/spikeHandshakeRuntime.ts',
      'src/modules/clearance',
      'src/modules/harness/agent-door.ts',
      'src/modules/harness/agent-tool-write-scope.ts',
      'src/modules/harness/query-authority-receipt.ts',
      'src/modules/routing-kernel/public.ts',
      'src/routes/api.answer.ts',
      'src/routes/api.chat.ts',
      'src/routes/api.chat.models.ts',
      'tests/integration/answer-route.test.ts',
      'tests/integration/chat-route.test.ts',
      'tests/integration/chat-models-route.test.ts',
    ]),
    routes: Object.freeze(['/api/agent/tools', '/api/answer', '/api/chat', '/api/chat/models']),
    tables: Object.freeze([
      'clearanceMandates', 'clearanceGreenlights', 'clearanceReceipts',
      'procurementRequests', 'procurementQuotes', 'businessActionRequests',
      'protectedActionRequests', 'actionReceipts',
    ]),
    jobs: Object.freeze(['cleanupLegacyClearance', 'repairProtectedActions', 'dispatchProcurementRequests']),
    environmentKeys: Object.freeze([
      'AE_ALLOW_CHAT_API', 'AE_SOURCE_WRITE_KEY_CLEARANCE', 'AE_SOURCE_WRITE_KEY_BUSINESS_ACTION',
      'AE_SOURCE_WRITE_KEY_PROTECTED_ACTION', 'AE_SOURCE_WRITE_KEY_PROCUREMENT',
    ]),
    importTokens: Object.freeze([
      'handshake-protocol-kernel', 'modules/clearance', 'query-authority-receipt', 'spikeHandshakeRuntime',
    ]),
  }),
  retainedNonAuthority: Object.freeze([
    Object.freeze({ domain: 'registered-business-listings', roots: ['src/modules/business', 'src/modules/catalog', 'src/modules/registry'] }),
    Object.freeze({ domain: 'marketplace-inquiries', roots: ['src/modules/inquiries'] }),
    Object.freeze({ domain: 'validation-harness', roots: ['src/modules/harness'] }),
    Object.freeze({ domain: 'demand-observation', roots: ['src/modules/demand'] }),
  ]),
})
