import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { SupplySourceInput } from '../../src/modules/capability-supply/source-preview'
import { package5ReferenceProviderDescriptor } from './package5-reference-provider/core'

type SourceKind = 'openapi' | 'mcp' | 'agent_plugin' | 'x402'

export type Package5ReferenceFixtureDefinition = Readonly<{
  kind: SourceKind
  source: SupplySourceInput
  candidateMatch:
    | Readonly<{ path: '/openapi/execute'; method: 'post' }>
    | Readonly<{ toolName: 'package5_mcp_execute' | 'package5_agent_plugin_execute' }>
    | Readonly<{ resourceUrl: string; method: 'POST' }>
  presentation: Readonly<{ name: string; description: string; category: 'release-proof' }>
  consequences: Readonly<{ effects: readonly []; dataUse: readonly []; evidence: readonly [] }>
  pricing: Readonly<{ kind: 'free' | 'source_x402' }>
  validationInput: Readonly<{ value: string }>
  callInput: Readonly<{ value: string }>
}>

export function package5ReferenceFixtureDefinitions(origin: string): readonly Package5ReferenceFixtureDefinition[] {
  const descriptor = package5ReferenceProviderDescriptor(origin)
  const remoteRef = canonicalDigest({
    format: 'agent-plugin-mcp-remote:v1',
    name: 'package5-reference-provider',
    transport: 'streamable-http',
    serverUrl: descriptor.mcpUrl,
  })
  const common = (kind: SourceKind) => ({
    kind,
    presentation: {
      name: `Package 5 ${kind.replace('_', ' ')} reference Tool`,
      description: `Deterministic ${kind.replace('_', ' ')} Provider Tool for Package 5 release proof.`,
      category: 'release-proof' as const,
    },
    consequences: { effects: [], dataUse: [], evidence: [] } as const,
    pricing: { kind: kind === 'x402' ? 'source_x402' as const : 'free' as const },
    validationInput: { value: `${kind}-validation` },
    callInput: { value: `${kind}-call` },
  })
  return [
    {
      ...common('openapi'),
      source: { kind: 'openapi', definitionUrl: descriptor.openApiUrl, environment: 'sandbox' },
      candidateMatch: { path: '/openapi/execute', method: 'post' },
    },
    {
      ...common('mcp'),
      source: { kind: 'mcp', serverUrl: descriptor.mcpUrl, environment: 'sandbox' },
      candidateMatch: { toolName: 'package5_mcp_execute' },
    },
    {
      ...common('agent_plugin'),
      source: {
        kind: 'agent_plugin',
        pluginJson: descriptor.pluginJson,
        mcpJson: descriptor.mcpJson,
        remoteRef,
        environment: 'sandbox',
      },
      candidateMatch: { toolName: 'package5_agent_plugin_execute' },
    },
    {
      ...common('x402'),
      source: { kind: 'x402', resourceUrl: descriptor.x402Url, method: 'POST', environment: 'sandbox' },
      candidateMatch: { resourceUrl: descriptor.x402Url, method: 'POST' },
    },
  ]
}
