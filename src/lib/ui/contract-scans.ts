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
  ]).filter((violation) => !isAllowedConvexSchemaComposition(violation))
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
  return scanPatterns(targets, [
    {
      rule: 'payment-or-booking-overclaim',
      message: 'Owner/public copy cannot imply live booking or payment behavior.',
      pattern: /\b(?:book instantly|book now|booking confirmed|pay now|payment required|checkout|wallet ready)\b/i,
    },
    {
      rule: 'agent-action-overclaim',
      message: 'Owner/public copy cannot imply callable or autonomous agent actions.',
      pattern: /\b(?:callable agent|agent-ready|agent-native|autonomous agent|AI booking|guaranteed response)\b/i,
    },
    {
      rule: 'marketplace-trust-overclaim',
      message: 'Owner/public copy cannot imply marketplace, partner, or unsupported verification claims.',
      pattern: /\b(?:marketplace|partner network|verified by ABR|ABR verified by default)\b/i,
    },
  ])
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
