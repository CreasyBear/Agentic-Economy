import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { DiscoveryStatus } from './schema-values'
import type {
  DeveloperDiscoveryCanonicalFunnelEvent,
  DeveloperDiscoveryCapabilityLaunchSupportRecord,
  DeveloperDiscoveryFreshnessReadback,
  DeveloperDiscoveryLaunchSupportReadiness,
  DeveloperDiscoverySupportChannel,
  DiscoveryGatedExclusion,
  DiscoveryGatedExclusionSurface,
  DiscoveryProjectionGateInput,
  DiscoveryProjectionGateResult,
  DiscoverySupportMatrixRow,
  DiscoverySupportState,
  DiscoverySupportSurface,
} from './developer-discovery-types'

export function createDeveloperDiscoverySupportRecord(
  overrides: Partial<DeveloperDiscoveryCapabilityLaunchSupportRecord> = {}
): DeveloperDiscoveryCapabilityLaunchSupportRecord {
  return {
    capability: 'developer_discovery',
    primaryOwnerRef: 'owner:developer-discovery',
    primaryAdminOperatorRef: 'admin:developer-discovery-primary',
    backupOwnerRef: 'owner:developer-discovery-backup',
    backupAdminOperatorRef: 'admin:developer-discovery-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['developer_docs', 'schema_examples', 'route_health', 'privacy_response', 'bot_abuse_response'],
    capacityThreshold: {
      maxRouteParityFailures: 0,
      maxPrivateDataIncidents: 0,
      maxBotAbuseIncidents: 5,
    },
    backlogAgeThresholdMs: 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: {
      staleArtifacts: 0,
      routeParityFailures: 0,
      privateDataExposure: 0,
      botAbuse: 0,
      apiKeyRevokeRotate: 0,
    },
    supportEscalationPath: 'Phase 3 developer discovery support queue.',
    claimDisablePath: 'Set developer_discovery_publish_enabled=false to withhold public artifacts while preserving readback.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Schema parity fails, route health is stale, or private data exposure is suspected.',
        action: 'Disable developer_discovery_publish_enabled and mark artifacts withheld.',
      },
      {
        channel: 'schema_examples',
        trigger: 'Generated schema or examples drift from public catalog DTO parity.',
        action: 'Withhold schema/examples until route parity is repaired.',
      },
      {
        channel: 'bot_abuse_response',
        trigger: 'Bot fetches exceed support capacity or abuse thresholds.',
        action: 'Throttle or degrade artifact fetch claims while retaining public readback.',
      },
      {
        channel: 'api_key_support',
        trigger: 'Read-only key revoke or rotate is required after a future accepted key gate.',
        action: 'Disable discovery_api_keys_enabled without blocking base public docs/schema/examples.',
      },
    ],
    evidenceRefs: ['support:developer-discovery:manual'],
    sourceHash: canonicalDigest('developer-discovery-support'),
    correlationId: 'corr:developer-discovery-support',
    lastReviewedAt: 0,
    ...overrides,
  }
}

export function evaluateDeveloperDiscoveryLaunchSupport(input: {
  supportRecord?: DeveloperDiscoveryCapabilityLaunchSupportRecord
  requiredFunnelEvent: DeveloperDiscoveryCanonicalFunnelEvent
}): DeveloperDiscoveryLaunchSupportReadiness {
  const record = input.supportRecord
  if (record === undefined) {
    return {
      launchReady: false,
      status: 'missing_support_record',
      reason: 'A source-owned developer discovery support record is required before launch-ready evidence claims.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  const requiredChannels: readonly DeveloperDiscoverySupportChannel[] = ['developer_docs', 'schema_examples', 'route_health']
  if (!requiredChannels.every((channel) => record.supportedChannels.includes(channel))) {
    return {
      launchReady: false,
      status: 'missing_required_channel',
      reason: 'Developer docs, schema/examples, and route-health support channels must all be named.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  if (record.evidenceRefs.length === 0) {
    return {
      launchReady: false,
      status: 'missing_evidence',
      reason: 'Support readiness requires at least one non-secret evidence reference.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  if (
    record.phaseIncidentCounts.routeParityFailures > record.capacityThreshold.maxRouteParityFailures ||
    record.phaseIncidentCounts.privateDataExposure > record.capacityThreshold.maxPrivateDataIncidents ||
    record.phaseIncidentCounts.botAbuse > record.capacityThreshold.maxBotAbuseIncidents
  ) {
    return {
      launchReady: false,
      status: 'incident_threshold_exceeded',
      reason: 'Discovery support incident thresholds are exceeded; public claims must stay unavailable.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  return {
    launchReady: true,
    status: 'ready',
    reason: 'Support owner, kill rules, evidence, and route-health handling are source-owned.',
    requiredFunnelEvent: input.requiredFunnelEvent,
  }
}

export function evaluateDiscoveryProjectionGate(input: DiscoveryProjectionGateInput): DiscoveryProjectionGateResult {
  if (!input.routeParity) {
    return { kind: 'withheld', surface: input.surface, reason: 'Route parity evidence is missing.' }
  }
  if (!input.descriptorScanClean) {
    return { kind: 'withheld', surface: input.surface, reason: 'Descriptor scan has not proven read-only non-authority output.' }
  }
  if (input.evidence.length === 0) {
    return { kind: 'withheld', surface: input.surface, reason: 'Source-owned projection evidence is missing.' }
  }
  return { kind: 'accepted', surface: input.surface, evidence: input.evidence }
}

export function readDeveloperDiscoverySupportMatrix(input: {
  freshness: DeveloperDiscoveryFreshnessReadback
  projectionGates?: readonly DiscoveryProjectionGateInput[]
}): readonly DiscoverySupportMatrixRow[] {
  const baseState = supportStateFromFreshness(input.freshness)
  const baseReadbackStatus = discoveryStatusFromSupportState(baseState)
  const rows: DiscoverySupportMatrixRow[] = [
    supportRow('public_json_routes', 'Public JSON routes', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('ae_hosted_ucp', 'AE-hosted UCP manifest', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('llms_txt', 'LLMs text discovery', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('sitemap', 'Sitemap', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('robots', 'Robots policy', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('schema_examples', 'Schema and examples', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('route_health', 'Route health readback', baseState, baseReadbackStatus, input.freshness.reason),
  ]

  for (const gate of input.projectionGates ?? []) {
    const result = evaluateDiscoveryProjectionGate(gate)
    if (result.kind === 'accepted') {
      rows.push(
        supportRow(
          result.surface,
          result.surface === 'openapi_read_projection' ? 'OpenAPI read projection' : 'MCP read projection',
          baseState,
          baseReadbackStatus,
          input.freshness.reason,
          result.evidence
        )
      )
    }
  }

  return rows
}

export function readDeveloperDiscoveryGatedExclusions(): readonly DiscoveryGatedExclusion[] {
  return [
    gatedExclusion('api_keys', 'API keys', 'unavailable', 'Public read-only discovery does not need credentialed access.'),
    gatedExclusion('sdk', 'SDK', 'deferred', 'Measured demand has not justified package support.'),
    gatedExclusion('cli', 'CLI', 'deferred', 'The current route and artifact readbacks are enough for this slice.'),
    gatedExclusion('plugin', 'Plugin', 'deferred', 'No plugin channel has route-tested demand or support capacity.'),
    gatedExclusion('hosted_mcp_byo_proxy', 'Hosted MCP or BYO proxy', 'unavailable', 'Hosted tool transport is outside read-only discovery.'),
    gatedExclusion('agent_router', 'Agent Router', 'unavailable', 'Phase 3 does not fork catalog truth into a second router model.'),
    gatedExclusion('developer_gallery', 'Developer gallery', 'deferred', 'Gallery launch waits for measured builder demand.'),
    gatedExclusion('payment_descriptors', 'Payment descriptors', 'unavailable', 'Payment and commercial descriptors belong to a later paid-activation phase.'),
    gatedExclusion(
      'protected_action_descriptors',
      'Protected-action descriptors',
      'unavailable',
      'Owner-approved action descriptors are unavailable until protected-action evidence exists.'
    ),
  ]
}

function supportRow(
  surface: DiscoverySupportSurface,
  label: string,
  state: DiscoverySupportState,
  routeReadbackStatus: DiscoveryStatus,
  reason: string,
  evidence: readonly string[] = ['public-catalog-dto', 'route-readback']
): DiscoverySupportMatrixRow {
  return {
    surface,
    label,
    state,
    evidence,
    owner: 'agentic-economy-discovery',
    routeReadbackStatus,
    blocker: state === 'shipped' ? 'none' : reason,
    nextAction: state === 'shipped' ? 'watch route health and parity drift' : 'repair source readback before public claims',
  }
}

function gatedExclusion(
  surface: DiscoveryGatedExclusionSurface,
  label: string,
  state: DiscoveryGatedExclusion['state'],
  reason: string
): DiscoveryGatedExclusion {
  return {
    surface,
    label,
    state,
    reason,
    nextAction: 'Require a separate source-owned decision and route-tested evidence before changing this state.',
  }
}

function supportStateFromFreshness(freshness: DeveloperDiscoveryFreshnessReadback): DiscoverySupportState {
  switch (freshness.state) {
    case 'current':
      return 'shipped'
    case 'degraded':
      return 'degraded'
    case 'unavailable':
      return 'unavailable'
    default: {
      const _exhaustive: never = freshness.state
      return _exhaustive
    }
  }
}

function discoveryStatusFromSupportState(state: DiscoverySupportState): DiscoveryStatus {
  switch (state) {
    case 'shipped':
      return 'available'
    case 'degraded':
      return 'degraded'
    case 'unavailable':
    case 'deferred':
    case 'withheld':
      return 'unavailable'
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}
