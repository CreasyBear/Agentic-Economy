import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export type ScanTarget = {
  root: string
  includeExtensions?: readonly string[]
  exclude?: readonly string[]
}

export type ScanViolation = {
  file: string
  line: number
  rule: string
  message: string
  excerpt: string
}

type PatternRule = {
  rule: string
  message: string
  pattern: RegExp
}

type PhaseNumber = 2 | 3 | 4 | 5 | 6

type CopyClaimRule = PatternRule & {
  allowedPhases?: readonly PhaseNumber[]
  negativeOnly?: boolean
}

const defaultExtensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.md', '.json', '.fixture'] as const
const ignoredDirectories = new Set([
  '.git',
  '.planning',
  '.codex',
  '.agents',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

const scannerUtilityPath = 'src/lib/ui/contract-scans.ts'
const forbiddenHandshakeSpecifierPattern = [
  String.raw`handshake-cloud(?:\/[^'"]*)?`,
  String.raw`(?:customer-edge|agentic-endpoint-access|cloud-adapter|x402)(?:\/[^'"]*)?`,
  String.raw`handshake-protocol-kernel\/(?:x402-protected-tool|mcp|http|agentic-endpoint-middleware|agentic-endpoint-access|cloud-adapter|customer-edge|experimental)`,
  String.raw`@x402\/[^'"]+`,
  String.raw`viem(?:\/[^'"]*)?`,
  String.raw`@modelcontextprotocol\/[^'"]+`,
].join('|')
const forbiddenHandshakeImportPattern = new RegExp(
  String.raw`from\s+['"](?:${forbiddenHandshakeSpecifierPattern})['"]|` +
    String.raw`import\s*\(\s*['"](?:${forbiddenHandshakeSpecifierPattern})['"]\s*\)|` +
    String.raw`import\s+['"](?:${forbiddenHandshakeSpecifierPattern})['"]`,
)

export function scanBackupImports(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  return scanPatterns(targets, [
    {
      rule: 'backup-import',
      message: 'Runtime source cannot import or reference the backup repo.',
      pattern: /Agentic-Economy-Backup|\.\.\/Agentic-Economy-Backup/,
    },
    {
      rule: 'planning-runtime-import',
      message: 'Runtime source cannot import planning files.',
      pattern: /from\s+['"][^'"]*\.planning|import\s+['"][^'"]*\.planning/,
    },
    {
      rule: 'forbidden-handshake-import',
      message: 'Handshake kernel imports are quarantined to the root package and /adapter-sdk only.',
      pattern: forbiddenHandshakeImportPattern,
    },
  ])
}

export function scanPrivateImports(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  return scanPatterns(targets, [
    {
      rule: 'module-private-import',
      message: 'Routes and sibling modules must use module public seams, not internal files.',
      pattern: /from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/[^'"]+\/internal\/[^'"]+['"]/,
    },
  ]).filter((violation) => !isAllowedConvexSchemaComposition(violation) && !isAllowedModulePublicSeam(violation))
}

export function scanRouteBoundaries(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  return scanPatterns(targets, [
    {
      rule: 'route-convex-schema-import',
      message: 'Routes cannot import Convex schema or generated document contracts.',
      pattern: /from\s+['"][^'"]*convex\/schema['"]/,
    },
    {
      rule: 'route-owned-convex-transport',
      message: 'Routes must call module source ports instead of owning Convex transport plumbing.',
      pattern: /from\s+['"]convex\/(?:browser|server)['"]/,
    },
    {
      rule: 'route-private-module-import',
      message: 'Routes must import module public seams only.',
      pattern: /from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/[^'"]+\/internal\/[^'"]+['"]/,
    },
    {
      rule: 'route-clearance-functions-import',
      message: 'Routes must use the clearance public/server seams, not clearance source mutation implementation files.',
      pattern: /from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/clearance\/clearance\.functions['"]/,
    },
    {
      rule: 'route-future-provider-import',
      message: 'Phase 1 routes cannot import future provider SDKs.',
      pattern: /from\s+['"](?:stripe|openai|@ai-sdk\/[^'"]+|x402)['"]/,
    },
  ])
}

export function scanTypeScriptStandards(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  return scanPatterns(
    targets,
    [
      {
        rule: 'explicit-any',
        message: 'Explicit any is not allowed in runtime TypeScript.',
        pattern: /:\s*any\b|<any\b|as\s+any\b/,
      },
      {
        rule: 'unknown-double-cast',
        message: 'Double casts through unknown are not allowed.',
        pattern: /as\s+unknown\s+as\b/,
      },
      {
        rule: 'non-null-assertion',
        message: 'Non-null assertions hide missing-state bugs.',
        pattern: /[A-Za-z0-9_$\]\)]!\s*(?:[;,\)\]\}]|$)/,
      },
      {
        rule: 'convex-any-validator',
        message: 'v.any() is not allowed outside a documented boundary adapter.',
        pattern: /\bv\.any\s*\(/,
      },
      {
        rule: 'broad-status-string',
        message: 'Status/result/source state fields must use literal unions, not broad strings.',
        pattern: /\b(?:status|result|sourceState)\s*:\s*string\b/,
      },
      {
        rule: 'inexact-convex-return',
        message: 'Convex functions must expose exact result contracts.',
        pattern: /returns\s*:\s*v\.any\s*\(|Promise\s*<\s*unknown\s*>/,
      },
      {
        rule: 'hard-coded-source-csrf',
        message: 'Runtime source writes must use source-write admission, not hard-coded CSRF literals.',
        pattern: /['"`]csrf-[^'"`]*['"`]|`csrf-\$\{/,
      },
      {
        rule: 'client-exposed-source-write-secret',
        message: 'Source write admission secrets must stay server-only and never use a VITE_ prefix.',
        pattern: /\bVITE_AE_SOURCE_WRITE_SECRET\b/,
      },
    ],
    ['src/routeTree.gen.ts', 'convex/_generated']
  ).filter((violation) => !isDocumentedJsonBoundary(violation))
}

function isDocumentedJsonBoundary(violation: ScanViolation): boolean {
  if (violation.rule !== 'convex-any-validator') return false
  return (
    violation.file === 'convex/capabilitySupply.ts'
      && violation.excerpt.includes('v.any()')
      && (
        violation.excerpt.includes('runtime-validated adapter config boundary')
        || violation.excerpt.includes('runtime-validated capability publication boundary')
      )
  ) || (
    violation.file === 'convex/customerRequestApplication.ts'
      && violation.excerpt.includes('v.any()')
      && violation.excerpt.includes('runtime-validated JsonValue boundary')
  ) || (
    violation.file === 'src/modules/customer-request/internal/convex-v2-schema.ts'
      && violation.excerpt.includes('v.any()')
      && violation.excerpt.includes('runtime-validated JsonValue boundary')
  ) || (
    violation.file === 'convex/customerRequestV2ProviderExecution.ts'
      && violation.excerpt.includes('v.any()')
      && violation.excerpt.includes('runtime-validated JsonValue boundary')
  ) || (
    violation.file === 'convex/customerRequestV2ProviderReconciliation.ts'
      && violation.excerpt.includes('v.any()')
      && violation.excerpt.includes('runtime-validated JsonValue boundary')
  )
}

export function scanCopyClaims(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  const violations = scanPatterns(targets, copyClaimRules)

  return violations.filter((violation) => {
    const rule = copyClaimRules.find((candidate) => candidate.rule === violation.rule)

    return rule === undefined || !isAllowedCopyClaim(violation, rule)
  })
}

const pm05TrustOverclaimPattern =
  /\b(?:book(?:\s+now|ed|ing)?|schedule(?:d|s|ing)?|dispatch(?:ed|es|ing)?|auto[- ]?fulfil(?:l|led|ment)?|autonomous(?:ly)?|pay(?:ment|ments|ing)?|paid|checkout|charg(?:e|ed|ing)|wallet|settlement|live\s+(?:availability|payment|money|stripe)|real[- ]?time\s+availability|available\s+now|marketplace\s+(?:liquidity|ready|providers?)|ready providers?)\b/i
const pm05InternalVocabularyPattern =
  /\b(?:source-owned|readback|manifest|capabilit(?:y|ies)|gateway|operator|MCP|OpenAPI|callable|agent-native|DTO|fixture)\b/i
const pm05UnqualifiedVerifiedPattern = /\bverified\b/i

export function scanPublicLanguage(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  return scanPatterns(
    targets,
    [
      {
        rule: 'banned-em-dash',
        message: 'Public-facing copy must not use em dashes or en dashes as separators.',
        pattern: /[—–]/,
      },
      {
        rule: 'public-internal-identifier',
        message: 'Public-facing copy cannot expose source/private implementation identifiers.',
        pattern: /\b(?:ownerId|businessId|serviceId|sourceHash|rawContact|clerk|admin)\b/i,
      },
      {
        rule: 'public-product-register',
        message: 'Public-facing copy should lead with customer outcomes, not product/internal framing.',
        pattern: /\b(?:the answer record is the product|internal language|internal product|runtime state)\b/i,
      },
      {
        rule: 'public-mechanism-language',
        message: 'Public-facing copy should not expose implementation or mechanism vocabulary.',
        pattern:
          /\b(?:source-owned answer records?|source-owned service pages?|source truth|answer-record language|answer record assistants|public answer record|source-owned catalog state|source record|public data readback|source readback|route readback|registry search|registry results)\b/i,
      },
      {
        rule: 'public-protocol-language',
        message: 'Public human surfaces must not mention protocols or machine interfaces.',
        pattern: /\b(?:MCP|OpenAPI|callable|protocol)\b/i,
      },
      {
        rule: 'public-epistemic-ledger-label',
        message: 'Public human surfaces must not show internal epistemic ledger labels.',
        pattern: /\b(?:KNOWN|UNKNOWN|UNAVAILABLE|NEXT_STEP)\b/,
      },
      {
        rule: 'generic-registry-language',
        message: 'The public registry must use customer-facing business-detail language, not generic search/result/page wording.',
        pattern: /\b(?:Find public service pages|Public business pages|Registry search|No registry results|Open page)\b/,
      },
      {
        rule: 'public-next-step-label',
        message: 'Public human surfaces must use "What to do now", not "Next step" or "Next".',
        pattern: /\b(?:Next step|>\s*Next\s*<|"Next step"|'Next step')\b/,
      },
      {
        rule: 'generic-money-language',
        message: 'Public-facing copy cannot imply wallet, custody, checkout, or marketplace behavior.',
        pattern: /\b(?:wallet|custody|checkout|marketplace)\b/i,
      },
      {
        rule: 'handshake-internal-vocabulary',
        message: 'Public and assistant-visible copy must not expose internal identity or clearance vocabulary.',
        pattern: /\b(?:Handshake|HSK|kernel|greenlight|clearance|mandate|protocol|gateway|ActionContract)\b/i,
      },
      {
        rule: 'pm05-trust-overclaim',
        message: 'PM-05 public or assistant-visible language must not imply booking, payment, dispatch, autonomy, live availability, or marketplace liquidity.',
        pattern: pm05TrustOverclaimPattern,
      },
      {
        rule: 'pm05-internal-vocabulary',
        message: 'PM-05 public or assistant-visible language must not expose internal architecture vocabulary.',
        pattern: pm05InternalVocabularyPattern,
      },
      {
        rule: 'pm05-unqualified-verified',
        message: 'PM-05 public or assistant-visible language may use verified only with a named standard and evidence row.',
        pattern: pm05UnqualifiedVerifiedPattern,
      },
    ],
    [scannerUtilityPath]
  ).filter((violation) => !isAllowedPublicLanguageViolation(violation))
}

function isAllowedPublicLanguageViolation(violation: ScanViolation): boolean {
  const normalized = normalizedScanPath(violation.file)

  if (isAllowedPm05PublicLanguageContext(normalized)) {
    return [
      'public-protocol-language',
      'generic-money-language',
      'handshake-internal-vocabulary',
      'pm05-trust-overclaim',
      'pm05-internal-vocabulary',
      'pm05-unqualified-verified',
    ].includes(violation.rule)
  }

  if (violation.rule === 'handshake-internal-vocabulary') {
    return normalized.includes('src/modules/clearance/internal/')
  }

  if (violation.rule === 'pm05-trust-overclaim') {
    return (
      isUnavailableOrDeferredClaimContext(violation.excerpt, pm05TrustOverclaimPattern) ||
      isPm05BoundaryRefusal(violation.excerpt)
    )
  }

  if (violation.rule === 'pm05-unqualified-verified') {
    return isNamedStandardVerifiedEvidence(violation.excerpt)
  }

  return false
}

function isAllowedPm05PublicLanguageContext(normalized: string): boolean {
  return (
    normalized.includes('.planning/') ||
    normalized.includes('tests/copy/') ||
    /src\/modules\/[^/]+\/internal\//.test(normalized)
  )
}

function isNamedStandardVerifiedEvidence(excerpt: string): boolean {
  return /\bverified\s+against\b[^.;\n]{1,120}\bstandard\b[^.;\n]{0,120}\bevidence\s+(?:row|record)\b/i.test(excerpt)
}

function isPm05BoundaryRefusal(excerpt: string): boolean {
  const capabilityInClause = cloneRegExp(pm05TrustOverclaimPattern)

  return excerpt
    .split(/[.;!?\n]/)
    .filter((clause) => capabilityInClause.test(clause))
    .every((clause) => {
      const [boundarySegment = '', ...contrastSegments] = clause.split(/\bbut\b|\bwhile\b|\bwhereas\b/i)
      const namesBoundary =
        /\bdoes\s+not\b/i.test(boundarySegment) ||
        /\bno\s+(?:booking|payment|dispatch|live payment|production payment)\b/i.test(boundarySegment)

      return (
        namesBoundary &&
        !contrastSegments.some(
          (segment) =>
            pm05TrustOverclaimPattern.test(segment) &&
            positiveClaimPattern.test(segment) &&
            !unavailableOrDeferredPattern.test(segment),
        )
      )
    })
}


const copyClaimRules: readonly CopyClaimRule[] = [
  {
    rule: 'payment-or-booking-overclaim',
    message: 'Owner/public copy cannot imply live booking or payment behavior.',
    pattern:
      /\b(?:book instantly|book now|booking confirmed|bookings?\s+(?:are\s+)?(?:available|live|ready|enabled|supported|confirmed|guaranteed)|(?:available|live|ready|enabled|supported|confirmed|guaranteed)\s+bookings?|pay now|payment required|payments?\s+(?:are\s+)?(?:available|live|ready|enabled|supported)|(?:available|live|ready|enabled|supported)\s+payments?|paymentRequired\s*:\s*true|wallet ready)\b/i,
  },
  {
    rule: 'agent-action-overclaim',
    message: 'Owner/public copy cannot imply callable or autonomous agent actions.',
    pattern: /\b(?:callable agent|agent-ready|agent-native|autonomous agent|AI booking|guaranteed response)\b/i,
  },
  {
    rule: 'marketplace-trust-overclaim',
    message: 'Owner/public copy cannot imply marketplace, partner, or unsupported verification claims.',
    pattern: /\b(?:marketplace\b|partner network|verified by ABR|ABR verified by default)\b/i,
    negativeOnly: true,
  },
  {
    rule: 'p2-inquiry-overclaim',
    message: 'Inquiry and owner-inbox claims belong only in Phase 2 planning/test contexts until shipped.',
    pattern:
      /\b(?:customer inquiry|public inquiry form|submit(?:s|ted)? (?:an )?inquiry|owner inbox|message the owner|owner reply)\b/i,
    allowedPhases: [2],
  },
  {
    rule: 'p2-notification-provider-overclaim',
    message: 'Resend/Novu notification claims belong only in Phase 2 planning/test contexts until shipped.',
    pattern: /\b(?:Resend|Novu|notification outbox|email notification|delivery readback)\b/i,
    allowedPhases: [2],
  },
  {
    rule: 'p3-read-only-discovery-overclaim',
    message: 'Developer discovery/docs/schema/API claims belong only in Phase 3 planning/test contexts until shipped.',
    pattern:
      /\b(?:developer discovery|builder discovery|agent discovery|developer\/agent docs|schema docs|API docs|API examples|read-only discovery|support matrix|route health)\b/i,
    allowedPhases: [3],
  },
  {
    rule: 'p3-developer-platform-overclaim',
    message: 'SDK/CLI/MCP/API-key/protocol claims must stay negative planning/test posture.',
    pattern:
      /\b(?:SDK\/CLI platform|SDK\/CLI\/plugin ecosystem|MCP mutation|MCP tools?|API-key platform|API key platform|developer launch|mutation API|standard merchant-origin UCP|merchant-origin UCP|(?:\/?\.)well-known\/ucp|\.well-known UCP|OpenAPI\b|action endpoint|payment handler|callable endpoint|tool-call|agent-callable)\b/i,
    negativeOnly: true,
  },
  {
    rule: 'p4-protected-action-overclaim',
    message: 'Protected action proposal/approval claims belong only in Phase 4 planning/test contexts until shipped.',
    pattern:
      /\b(?:protected-action loop|protected action proposal|action proposal|owner approval|approve action|approval-required|action gateway|proposeAction|provider\/internal attempt)\b/i,
    allowedPhases: [4],
  },
  {
    rule: 'p4-autonomous-action-overclaim',
    message: 'Autonomous/direct-execute action claims must stay negative planning/test posture.',
    pattern: /\b(?:autonomous protected execution|direct execute|auto-approve|auto-execute|provider success)\b/i,
    negativeOnly: true,
  },
  {
    rule: 'p5-paid-activation-overclaim',
    message: 'Autumn/Stripe paid-activation claims belong only in Phase 5 planning/test contexts until shipped.',
    pattern:
      /\b(?:Autumn(?: Cloud)?|Autumn\+Stripe|Stripe PSP|Stripe Billing|Stripe Checkout|paid activation|paid-activation|checkout|subscription|customer portal|billing rail|billing center|billing reconciliation)\b/i,
    allowedPhases: [5],
  },
  {
    rule: 'p5-money-rail-overclaim',
    message: 'Wallet/Connect/x402/custody/settlement/direct-Stripe claims must stay negative planning/test posture.',
    pattern:
      /\b(?:wallet(?:s)?|(?<!-)balances?|credits?|credit balance|credits? balance|stored value|custody|x402|Connect|Connect marketplace|Stripe Connect|Connect\/x402|marketplace payout|split payout|split charge|settlement|payment handlers?|paymentRequired\s*(?::|=)\s*true|direct Stripe rail|direct Stripe subscription|Stripe subscription authority)\b/i,
    negativeOnly: true,
  },
  {
    rule: 'p6-business-action-overclaim',
    message: 'Business-action receipt claims belong only in Phase 6 source-owned/proven contexts until proof exists.',
    pattern:
      /\b(?:Business Action Card|Capability Request|authorization checkpoint|GuardrailDecisionEvidence|ExternalEvidenceEvent|Action Receipt|receipt-backed (?:software|autonomous business) operation|Hermes-run paid intake provisioning)\b/i,
    allowedPhases: [6],
  },
  {
    rule: 'p6-autonomous-money-marketplace-overclaim',
    message: 'Phase 6 copy cannot imply production autonomous payment, wallet, custody, settlement, or marketplace behavior.',
    pattern:
      /\b(?:self-approving agent|unbounded autonomous spend|instant purchase|agent checkout|AE wallet|AE credits|AE custody|seller payout|marketplace settlement|Stripe Connect|Connect\b|x402|product marketplace|generic API marketplace|production autonomous payment support|live money movement)\b/i,
    negativeOnly: true,
  },
]

function isAllowedCopyClaim(violation: ScanViolation, rule: CopyClaimRule): boolean {
  if (isCopyTestContext(violation.file)) {
    return true
  }

  if (isUiPropBalanceFalsePositive(violation, rule)) {
    return true
  }

  if (isAllowedPhase3DiscoveryReadbackClaim(violation, rule)) {
    return true
  }

  if (isUnavailableOrDeferredClaimContext(violation.excerpt, rule.pattern)) {
    return true
  }

  const phases = copyClaimContextPhases(violation.file)
  if (phases.length === 0) {
    return false
  }

  if (rule.negativeOnly) {
    return isNegativeCapabilityContext(violation.excerpt, rule.pattern)
  }

  return rule.allowedPhases?.some((phase) => phases.includes(phase)) ?? false
}

function isUiPropBalanceFalsePositive(violation: ScanViolation, rule: CopyClaimRule): boolean {
  if (rule.rule !== 'p5-money-rail-overclaim') {
    return false
  }

  const withoutTextWrapProp = violation.excerpt.replace(/\btextWrap=["']balance["']/g, '')
  if (withoutTextWrapProp === violation.excerpt) {
    return false
  }

  return !cloneRegExp(rule.pattern).test(withoutTextWrapProp)
}

function isAllowedPhase3DiscoveryReadbackClaim(violation: ScanViolation, rule: CopyClaimRule): boolean {
  const normalized = normalizedScanPath(violation.file)
  if (!isPhase3DiscoveryRuntimeContext(normalized)) {
    return false
  }

  if (rule.rule === 'p3-read-only-discovery-overclaim') {
    return isSourceOwnedDiscoveryReadbackContext(violation.excerpt)
  }

  if (rule.rule === 'p3-developer-platform-overclaim') {
    return isDiscoveryProjectionReadbackContext(violation.excerpt)
  }

  return false
}

function copyClaimContextPhases(file: string): readonly PhaseNumber[] {
  const normalized = normalizedScanPath(file)

  if (isPlanningPhasePath(normalized, '02-05-PRODUCTION-MATURITY-')) {
    return [2, 3, 4, 5]
  }

  if (isPlanningPhasePath(normalized, '02-human-inquiry-owner-inbox/')) {
    return [2]
  }

  if (isPhase2InquiryRuntimeContext(normalized)) {
    return [2]
  }

  if (isPlanningPhasePath(normalized, '03-standard-agent-builder-discovery/')) {
    return [3]
  }

  if (isPlanningPhasePath(normalized, '04-owner-pending-protected-actions/')) {
    return [4]
  }

  if (isPhase4ProtectedActionRuntimeContext(normalized)) {
    return [4]
  }

  if (isPlanningPhasePath(normalized, '05-paid-activation-money-rails/')) {
    return [5]
  }

  if (isPhase5PaidActivationRuntimeContext(normalized)) {
    return [5]
  }

  if (isCopyTestContext(file)) {
    return [2, 3, 4, 5, 6]
  }

  if (isPlanningPhasePath(normalized, '06-agentic-business-action-receipts/')) {
    return [6]
  }

  if (isPhase6BusinessActionRuntimeContext(normalized)) {
    return [6]
  }

  return []
}

function isPlanningPhasePath(normalized: string, phasePath: string): boolean {
  return (
    normalized.includes(`.planning/phases/${phasePath}`) ||
    normalized.includes(`.planning/archive/phases/${phasePath}`)
  )
}

function isPhase2InquiryRuntimeContext(normalizedPath: string): boolean {
  return [
    'src/components/ae/inquiries/',
    'src/modules/inquiries/',
    'src/modules/notification-outbox/',
    'src/lib/server/notification-provider.ts',
    'src/routes/$slug.inquiry',
    'src/routes/_operator/$slug.inquiry',
    'src/routes/owner.inquiries',
    'src/routes/admin.inquiries',
    'src/routes/api.notification',
    'src/routes/_operator/owner.inquiries',
    'src/routes/_operator/admin.inquiries',
    'src/routes/_operator/api.notification',
  ].some((path) => normalizedPath.includes(path))
}

function isPhase3DiscoveryRuntimeContext(normalizedPath: string): boolean {
  return [
    'src/modules/discovery/',
    'src/routes/developers.discovery',
    'src/routes/_operator/developers.discovery',
    'src/routes/api.discovery',
    'src/routes/_operator/api.discovery',
  ].some((path) => normalizedPath.includes(path))
}

function isPhase4ProtectedActionRuntimeContext(normalizedPath: string): boolean {
  return [
    'src/modules/protected-action/',
    'src/routes/owner.actions',
    'src/routes/_operator/owner.actions',
    'src/routes/admin.protected-actions',
    'src/routes/_operator/admin.protected-actions',
    'convex/protectedActions.ts',
  ].some((path) => normalizedPath.includes(path))
}

function isPhase5PaidActivationRuntimeContext(normalizedPath: string): boolean {
  return [
    'src/modules/billing/',
    'src/lib/server/billing-provider.ts',
    'src/routes/owner.billing',
    'src/routes/_operator/owner.billing',
    'src/routes/admin.monetization',
    'src/routes/_operator/admin.monetization',
    'src/routes/_operator/api.billing',
    'src/routes/api.billing',
    'convex/billing.ts',
    'convex/billingStore.ts',
  ].some((path) => normalizedPath.includes(path))
}

function isPhase6BusinessActionRuntimeContext(normalizedPath: string): boolean {
  return [
    'src/modules/business-action/',
    'src/routes/owner.business-actions',
    'src/routes/_operator/owner.business-actions',
    'src/routes/admin.business-actions',
    'src/routes/_operator/admin.business-actions',
    'src/routes/_operator/api.business-actions',
    'src/routes/api.business-actions',
    'convex/businessActions.ts',
    'convex/businessActionStore.ts',
  ].some((path) => normalizedPath.includes(path))
}

function isSourceOwnedDiscoveryReadbackContext(excerpt: string): boolean {
  return /\b(?:source-owned|readback|read-only|support matrix|supportRow|supportEscalationPath|gatedExclusion|nextAction|freshness|route health|routeReadbackStatus|public catalog facts|parity|private data exposure|withheld|degraded|unavailable|deferred|unsupportedCapabilities)\b/i.test(
    excerpt
  )
}

function isDiscoveryProjectionReadbackContext(excerpt: string): boolean {
  return (
    /\b(?:OpenAPI|MCP) read projection\b/i.test(excerpt) &&
    /\b(?:read projection|projectionGate|evaluateDiscoveryProjectionGate|result\.surface)\b/i.test(excerpt) &&
    !hasPositiveClaimSegment(excerpt, /\b(?:OpenAPI\b|MCP)\b/i)
  )
}

function normalizedScanPath(file: string): string {
  const relativePath = relative(process.cwd(), file).replaceAll('\\', '/')
  const rawPath = file.replaceAll('\\', '/')

  return `${relativePath}\n${rawPath}`
}

function isCopyTestContext(file: string): boolean {
  return normalizedScanPath(file).includes('tests/copy/')
}

function isNegativeCapabilityContext(excerpt: string, capabilityPattern: RegExp): boolean {
  return isUnavailableOrDeferredClaimContext(excerpt, capabilityPattern)
}

function isUnavailableOrDeferredClaimContext(excerpt: string, capabilityPattern: RegExp): boolean {
  const capabilityInClause = cloneRegExp(capabilityPattern)

  return excerpt
    .split(/[.;!?\n]/)
    .filter((clause) => capabilityInClause.test(clause))
    .every((clause) => {
      return unavailableOrDeferredPattern.test(clause) && !hasPositiveClaimSegment(clause, capabilityPattern)
    })
}

function hasPositiveClaimSegment(excerpt: string, capabilityPattern: RegExp): boolean {
  const capabilityInSegment = cloneRegExp(capabilityPattern)

  return splitClaimSegments(excerpt).some(
    (segment) =>
      capabilityInSegment.test(segment) &&
      positiveClaimPattern.test(segment) &&
      !unavailableOrDeferredPattern.test(segment)
  )
}

function splitClaimSegments(excerpt: string): readonly string[] {
  return excerpt.split(/,|\bbut\b|\bwhile\b|\bwhereas\b/i)
}

function cloneRegExp(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.replace('g', ''))
}

const unavailableOrDeferredPattern =
  /\b(?:no|not live|not shipped?|not advertised|not available|never|unavailable|deferred|out of scope|outside|withheld|banned|blocked|stay out|stays out|remain(?:s)? unavailable|negative(?:ly)?|fail(?:s)? scans?|does not grant|does not need|not part of|gated exclusion|readback-gated)\b/i
const positiveClaimPattern = /\b(?:live|available|ready|enabled|supported|shipped|active|launch(?:ed)?|grants?|provides?)\b/i

export function scanUiContract(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  return scanPatterns(
    targets,
    [
      {
        rule: 'raw-color',
        message: 'Product-owned routes and AE components must use semantic tokens, not raw colors.',
        pattern: /#[0-9a-fA-F]{3,8}\b|\brgb\(|\bhsl\(|\bbg-(?:blue|green|emerald|orange|red|purple|slate|gray)-\d{2,3}\b|\btext-(?:blue|green|emerald|orange|red|purple|slate|gray)-\d{2,3}\b|\bborder-(?:blue|green|emerald|orange|red|purple|slate|gray)-\d{2,3}\b/,
      },
      {
        rule: 'space-utility',
        message: 'Use gap utilities instead of space-x/space-y.',
        pattern: /\bspace-[xy]-/,
      },
      {
        rule: `transition-${'all'}`,
        message: 'Use explicit transition properties, not the broad transition utility.',
        pattern: new RegExp(`\\btransition-${'all'}\\b`),
      },
      {
        rule: 'hardcoded-layer',
        message: 'Product-owned routes and AE components must use AE z-index tokens, not hardcoded Tailwind layers.',
        pattern: /\bz-(?:40|50|\d{3,})\b/,
      },
      {
        rule: 'raw-overlay',
        message: 'Overlays must use AE scrim tokens, not raw black opacity utilities.',
        pattern: /\bbg-black\/\d+\b/,
      },
      {
        rule: 'generic-tailwind-shadow',
        message: 'Product-owned routes and AE components must use AE shadows or hairlines, not generic Tailwind shadows.',
        pattern: /\bshadow-(?:sm|md|lg|xl|2xl)\b/,
      },
      {
        rule: 'arbitrary-visual-token',
        message: 'Arbitrary visual tokens belong in the token/component layer.',
        pattern: /\b(?:rounded|shadow|z|border-l)-\[/,
      },
      {
        rule: 'route-local-scroll-listener',
        message: 'Route-local scroll listeners are not part of the Phase 1 UI substrate.',
        pattern: /window\.addEventListener\s*\(\s*['"]scroll['"]/,
      },
    ],
    [scannerUtilityPath, 'src/components/ui']
  )
}

export function findFiles(targets: readonly ScanTarget[]): readonly string[] {
  const files: string[] = []

  for (const target of targets) {
    collectFiles(target.root, target, files)
  }

  return files.sort()
}

function scanPatterns(
  targets: readonly ScanTarget[],
  rules: readonly PatternRule[],
  extraExclusions: readonly string[] = []
): readonly ScanViolation[] {
  const violations: ScanViolation[] = []
  const files = findFiles(
    targets.map((target) => ({
      ...target,
      exclude: [...(target.exclude ?? []), ...extraExclusions],
    }))
  )

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const lines = content.split(/\r?\n/)

    for (const [index, line] of lines.entries()) {
      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          violations.push({
            file,
            line: index + 1,
            rule: rule.rule,
            message: rule.message,
            excerpt: line.trim(),
          })
        }
      }
    }
  }

  return violations
}

function collectFiles(root: string, target: ScanTarget, files: string[]): void {
  let stats
  try {
    stats = statSync(root)
  } catch {
    return
  }

  if (isExcluded(root, target.exclude ?? [])) {
    return
  }

  if (stats.isFile()) {
    if (hasAllowedExtension(root, target.includeExtensions ?? defaultExtensions)) {
      files.push(root)
    }
    return
  }

  if (!stats.isDirectory()) {
    return
  }

  const basename = root.split('/').at(-1) ?? root
  if (ignoredDirectories.has(basename)) {
    return
  }

  for (const entry of readdirSync(root)) {
    collectFiles(join(root, entry), target, files)
  }
}

function hasAllowedExtension(file: string, extensions: readonly string[]): boolean {
  return extensions.some((extension) => file.endsWith(extension))
}

function isExcluded(file: string, exclusions: readonly string[]): boolean {
  const normalized = relative(process.cwd(), file).replaceAll('\\', '/')
  return exclusions.some((exclude) => normalized === exclude || normalized.startsWith(`${exclude}/`))
}

function isAllowedConvexSchemaComposition(violation: ScanViolation): boolean {
  return (
    violation.rule === 'module-private-import' &&
    violation.file === 'convex/schema.ts' &&
    /from\s+['"]\.\.\/src\/modules\/[^'"]+\/internal\/(?:schema|convex-schema)['"]/.test(violation.excerpt)
  )
}

function isAllowedModulePublicSeam(violation: ScanViolation): boolean {
  if (violation.rule !== 'module-private-import') {
    return false
  }

  const match = /^src\/modules\/([^/]+)\/public\.ts$/.exec(violation.file)
  if (match === null) {
    return false
  }

  return match[1] !== undefined && /from\s+['"]\.\/internal\//.test(violation.excerpt)
}
