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

type PhaseNumber = 2 | 3 | 4 | 5

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
      rule: 'route-private-module-import',
      message: 'Routes must import module public seams only.',
      pattern: /from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/[^'"]+\/internal\/[^'"]+['"]/,
    },
    {
      rule: 'route-future-provider-import',
      message: 'Phase 1 routes cannot import future provider SDKs.',
      pattern: /from\s+['"](?:stripe|openai|@ai-sdk\/[^'"]+|x402)['"]/,
    },
  ])
}

export function scanSourceMining(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  return scanPatterns(
    targets,
    [
      {
        rule: 'backup-source-reference',
        message: 'Source-mined runtime must cite ledger context, not backup paths.',
        pattern: /Agentic-Economy-Backup|phase35|phase-35/i,
      },
      {
        rule: 'future-surface-symbol',
        message: 'Future-surface symbols are banned from Phase 1 runtime.',
        pattern:
          /\b(?:skills|request-market|requestMarket|expert|hosted-agent|hostedAgent|voice|persona|benchmark|leaderboard|wallet|credits|billing|stripe|x402|payment_handlers|protectedActions|proposeAction|actionGateway)\b/i,
      },
      {
        rule: 'future-protocol-symbol',
        message: 'Phase 1 cannot ship MCP, OpenAPI, API-key, or callable/payment-positive descriptors.',
        pattern: /\b(?:MCP|OpenAPI|API key|agent-callable)\b|callable\s*:\s*true|paymentRequired\s*:\s*true/i,
      },
    ],
    [scannerUtilityPath]
  )
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
    ],
    ['src/routeTree.gen.ts', 'convex/_generated']
  )
}

export function scanCopyClaims(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  const violations = scanPatterns(targets, copyClaimRules)

  return violations.filter((violation) => {
    const rule = copyClaimRules.find((candidate) => candidate.rule === violation.rule)

    return rule === undefined || !isAllowedCopyClaim(violation, rule)
  })
}

const copyClaimRules: readonly CopyClaimRule[] = [
  {
    rule: 'payment-or-booking-overclaim',
    message: 'Owner/public copy cannot imply live booking or payment behavior.',
    pattern:
      /\b(?:book instantly|book now|booking confirmed|pay now|payment required|paymentRequired\s*:\s*true|wallet ready)\b/i,
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
    message: 'SDK/CLI/MCP/API-key platform claims must stay negative planning/test posture.',
    pattern: /\b(?:SDK\/CLI platform|SDK\/CLI\/plugin ecosystem|MCP mutation|API-key platform|API key platform|developer launch|mutation API)\b/i,
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
    message: 'Wallet/Connect/x402/custody/settlement claims must stay negative planning/test posture.',
    pattern:
      /\b(?:wallet ready|wallet\/credits|credits balance|Connect\/x402|Stripe Connect|x402 checkout|x402 rail|custody rail|custody wallet|settlement platform|payment handlers?|paymentRequired\s*:\s*true)\b/i,
    negativeOnly: true,
  },
]

function isAllowedCopyClaim(violation: ScanViolation, rule: CopyClaimRule): boolean {
  if (isCopyTestContext(violation.file)) {
    return true
  }

  const phases = copyClaimContextPhases(violation.file)
  if (phases.length === 0) {
    return false
  }

  if (rule.negativeOnly) {
    return isNegativeCapabilityContext(violation.excerpt)
  }

  return rule.allowedPhases?.some((phase) => phases.includes(phase)) ?? false
}

function copyClaimContextPhases(file: string): readonly PhaseNumber[] {
  const normalized = normalizedScanPath(file)

  if (normalized.includes('.planning/phases/02-05-PRODUCTION-MATURITY-')) {
    return [2, 3, 4, 5]
  }

  if (normalized.includes('.planning/phases/02-human-inquiry-owner-inbox/')) {
    return [2]
  }

  if (normalized.includes('.planning/phases/03-standard-agent-builder-discovery/')) {
    return [3]
  }

  if (normalized.includes('.planning/phases/04-owner-pending-protected-actions/')) {
    return [4]
  }

  if (normalized.includes('.planning/phases/05-paid-activation-money-rails/')) {
    return [5]
  }

  if (isCopyTestContext(file)) {
    return [2, 3, 4, 5]
  }

  return []
}

function normalizedScanPath(file: string): string {
  const relativePath = relative(process.cwd(), file).replaceAll('\\', '/')
  const rawPath = file.replaceAll('\\', '/')

  return `${relativePath}\n${rawPath}`
}

function isCopyTestContext(file: string): boolean {
  return normalizedScanPath(file).includes('tests/copy/')
}

function isNegativeCapabilityContext(excerpt: string): boolean {
  return /\b(?:does not|do not|not live|not ship|not shipped|not advertised|not available|never|without|unless|unavailable|deferred|future products?|out of scope|rejects?|fail(?:s)? scans?|banned|blocked|stay out|remain(?:s)? unavailable|no\s+(?:AI|booking|payment|provider|autonomous|SDK|MCP|API-key|wallet|Connect|x402|custody|settlement)|cut these)\b/i.test(
    excerpt
  )
}

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
        rule: 'transition-all',
        message: 'Use explicit transition properties, not transition-all.',
        pattern: /\btransition-all\b/,
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
    /from\s+['"]\.\.\/src\/modules\/[^'"]+\/internal\/schema['"]/.test(violation.excerpt)
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
