/** Deliberate publication boundary. New content, includes, links and models need review. */
export const publicationManifest = {
  version: 1,
  canonicalOrigin: 'https://app.aecon.ai',
  guides: [
    { source: 'docs/foundations.md', output: 'index.md', title: 'Start here', section: 'Start here', depth: 2 },
    { source: 'docs/foundations.md', output: 'concepts/authority.md', title: 'Connect an Agent and control authority', section: 'Connect an Agent and control authority', depth: 2 },
    { source: 'docs/foundations.md', output: 'guides/purchase.md', title: 'Choose the purchase entry point', section: 'Choose the purchase entry point', depth: 2 },
    { source: 'docs/foundations.md', output: 'guides/recovery.md', title: 'Recover the same Call', section: 'Recover without making another purchase', depth: 2 },
    { source: 'packages/cli/README.md', output: 'cli.md', title: 'Agentic Economy CLI' },
    { source: 'docs/glossary.md', output: 'glossary.md', title: 'Glossary' },
    {
      source: 'docs/operations/deployments.md', output: 'concepts/compatibility.md',
      title: 'Public contract compatibility', section: 'Public contract compatibility', depth: 3,
    },
    { source: 'docs/foundations.md', output: 'guides/customer.md', title: 'Customer journey', section: 'Choose and use a Tool', depth: 2 },
    { source: 'docs/foundations.md', output: 'guides/administrator.md', title: 'Administrator journey', section: 'Administrator journey', depth: 2 },
    { source: 'docs/foundations.md', output: 'guides/integrator.md', title: 'Integrator journey', section: 'Integrator journey', depth: 2 },
    { source: 'docs/foundations.md', output: 'guides/provider.md', title: 'Provider journey', section: 'Provider journey', depth: 2 },
  ],
  // Official Fumadocs page-tree metadata, generated with the approved collection.
  navigation: {
    'meta.json': { pages: ['index', 'guides', 'cli', 'concepts', 'reference', 'glossary'] },
    'guides/meta.json': { title: 'Guides', pages: ['customer', 'administrator', 'integrator', 'provider', 'purchase', 'recovery'], defaultOpen: true },
    'concepts/meta.json': { title: 'Concepts', pages: ['authority', 'compatibility'], defaultOpen: false },
    'reference/meta.json': { title: 'API reference', pages: ['index', 'tool-call', 'operations', 'schemas'], defaultOpen: false },
    'reference/operations/meta.json': { title: 'Operations', defaultOpen: false },
    'reference/schemas/meta.json': { title: 'Schemas', defaultOpen: false },
  },
  linkMappings: {
    'docs/foundations.md': {
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1market-tools~1search/post': '/docs/reference/operations/registry-tools-search',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1market-tools~1describe/post': '/docs/reference/operations/registry-tools-describe',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1tools~1quote/post': '/docs/reference/operations/tool-quote',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1calls~1{callRef}/get': '/docs/reference/operations/call-status',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1calls~1{callRef}~1reconcile/post': '/docs/reference/operations/call-reconcile',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1calls~1{callRef}~1cancel/post': '/docs/reference/operations/call-cancel',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1sources~1preview/post': '/docs/reference/operations/supply-source-preview',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1publish/post': '/docs/reference/operations/supply-publish',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1status/post': '/docs/reference/operations/supply-status',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1recheck/post': '/docs/reference/operations/supply-recheck',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1withdraw/post': '/docs/reference/operations/supply-withdraw',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1republish/post': '/docs/reference/operations/supply-republish',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1connections~1connect/post': '/docs/reference/operations/supply-connection-connect',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1connections~1detail/post': '/docs/reference/operations/supply-connection-detail',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1connections~1revoke/post': '/docs/reference/operations/supply-connection-revoke',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1offboarding~1status/post': '/docs/reference/operations/supply-offboarding-status',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1tools~1procure/post': '/docs/reference/operations/tool-procure',
      '#choose-and-use-a-tool': '/docs/guides/customer',
      '#administrator-journey': '/docs/guides/administrator',
      '#integrator-journey': '/docs/guides/integrator',
      '#provider-journey': '/docs/guides/provider',
      '#connect-an-agent-and-control-authority': '/docs/concepts/authority',
      '#choose-the-purchase-entry-point': '/docs/guides/purchase',
      '#recover-without-making-another-purchase': '/docs/guides/recovery',
      'glossary.md': '/docs/glossary',
      'operations/deployments.md#public-contract-compatibility': '/docs/concepts/compatibility',
      'operations/deployments.md#accepted-application-release': '/docs/concepts/compatibility',
      '../packages/cli/README.md': '/docs/cli',
      'https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1tools~1call/post': '/docs/reference/tool-call',
      '../packages/cli/README.md#discover-before-connecting': '/docs/cli#discover-before-connecting',
      '../packages/cli/README.md#install-from-npm': '/docs/cli#install-from-npm',
      '../packages/cli/README.md#origin-credentials-and-provider-access': '/docs/cli#origin-credentials-and-provider-access',
      '../packages/cli/README.md#connect-inspect-a-quote-then-call': '/docs/cli#connect-inspect-a-quote-then-call',
      '../packages/cli/README.md#quote-and-run-a-plan': '/docs/cli#quote-and-run-a-plan',
      '../packages/cli/README.md#exact-procurement': '/docs/cli#exact-procurement',
      '../packages/cli/README.md#upgrade-disconnect-and-uninstall': '/docs/cli#upgrade-disconnect-and-uninstall',
    },
    'packages/cli/README.md': {
      '../../docs/operations/deployments.md#accepted-application-release': '/docs/concepts/compatibility',
      '../../docs/operations/deployments.md#public-contract-compatibility': '/docs/concepts/compatibility',
    },
  },
  externalLinks: [
    'https://github.com/CreasyBear/aecon-cli/releases',
    'https://app.aecon.ai/mcp', 'https://app.aecon.ai/mcp?readonly=1',
    'https://app.aecon.ai/.well-known/oauth-authorization-server',
    'https://app.aecon.ai/.well-known/oauth-protected-resource',
    'https://app.aecon.ai/.well-known/ucp',
    'https://app.aecon.ai/for-agents', 'https://app.aecon.ai/for-providers',
    'https://app.aecon.ai/llms.txt', 'https://app.aecon.ai/openapi.json',
    'https://app.aecon.ai/market', 'https://app.aecon.ai/activity', 'https://app.aecon.ai/trial',
    'https://app.aecon.ai/owner/settings/team', 'https://app.aecon.ai/owner/settings/agent-keys',
    'https://app.aecon.ai/owner/settings/spending', 'https://app.aecon.ai/owner/credit',
    'https://app.aecon.ai/owner/settings/receipts', 'https://app.aecon.ai/owner/settings/security-activity',
    'https://app.aecon.ai/owner/settings/workspace', 'https://app.aecon.ai/owner/operations/new',
    'https://app.aecon.ai/support', 'mailto:support@aecon.ai',
    'https://app.aecon.ai/agent-access#revoke', 'https://app.aecon.ai/agent-access',
  ],
  reference: { operationId: 'tool.call', path: '/api/v1/tools/call', method: 'post', schemaCount: 7 },
  referencePublication: {
    operationCount: 68, renderedOperationCount: 61, schemaCount: 148,
    unsupported: [
      {
        operationId: 'tool.plan.quote', path: '/api/v1/tools/plans/quote', method: 'post',
        reason: 'Scalar 1.5.2 does not render the propertyNames pattern on Plan node bounds.',
      },
      {
        operationId: 'tool.procure', path: '/api/v1/tools/procure', method: 'post',
        reason: 'Scalar 1.5.2 omits positional tuple item contracts in this operation schema closure. Use the exact exported OpenAPI contract.',
      },
      {
        operationId: 'registry.tools.search', path: '/api/v1/market-tools/search', method: 'post',
        reason: 'Scalar 1.5.2 omits positional tuple item contracts in this operation schema closure. Use the exact exported OpenAPI contract.',
      },
      {
        operationId: 'funding.quote', path: '/api/v1/funding/quote', method: 'post',
        reason: 'Scalar 1.5.2 omits positional tuple item contracts in this operation schema closure. Use the exact exported OpenAPI contract.',
      },
      {
        operationId: 'supply.tools.list', path: '/api/v1/supply/tools/list', method: 'post',
        reason: 'Scalar 1.5.2 omits positional tuple item contracts in this operation schema closure. Use the exact exported OpenAPI contract.',
      },
      {
        operationId: 'supply.status', path: '/api/v1/supply/status', method: 'post',
        reason: 'Scalar 1.5.2 omits positional tuple item contracts in this operation schema closure. Use the exact exported OpenAPI contract.',
      },
      {
        operationId: 'funding.handoff.status', path: '/api/v1/account/funding-sessions/{fundingSessionId}', method: 'get',
        reason: 'Scalar 1.5.2 omits positional tuple item contracts in this operation schema closure. Use the exact exported OpenAPI contract.',
      },
    ],
    notice: 'This is a source contract reference. Examples appear only where the owner supplied them; they do not establish hosted acceptance. Some operations require the complete OpenAPI contract because the pinned renderer cannot preserve its constraints.',
  },
  artifactSources: { 'SKILL.md': 'plugins/agentic-economy/skills/use-agentic-economy/SKILL.md' },
  pins: {
    '@scalar/openapi-to-markdown': '1.5.2', '@cfworker/json-schema': '4.1.1',
    unified: '11.0.5', 'remark-parse': '11.0.0', 'remark-gfm': '4.0.1',
    'remark-mdx': '3.1.1', parse5: '7.3.0', 'github-slugger': '2.0.0',
  },
} as const

export const schemaRoute = (name: string): string => `/docs/reference/schemas/${name}`
export const pageRoute = (output: string): string => {
  const path = output.replace(/\.mdx?$/, '').replace(/(?:^|\/)index$/, '')
  return path ? `/docs/${path}` : '/docs'
}
