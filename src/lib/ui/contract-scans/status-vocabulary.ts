import { readFileSync } from 'node:fs'

import ts from 'typescript'

import { findFiles, type ScanTarget, type ScanViolation } from './file-discovery'

const STATUS_LITERALS: Readonly<Record<string, true>> = {
  Connected: true,
  'Needs attention': true,
  Expired: true,
  Disconnected: true,
  Completed: true,
  Refused: true,
  Paused: true,
  Active: true,
  'Ready now': true,
  'Setup required': true,
  Unavailable: true,
  Operational: true,
  Degraded: true,
  Paid: true,
  Reversed: true,
  Current: true,
  Revoked: true,
}
const EXCLUDED_FILES: Readonly<Record<string, true>> = {
  'src/lib/ui/status-presentation.ts': true,
  'src/lib/ui/business-status-mapping.ts': true,
  'src/lib/ui/provider-plain-labels.ts': true,
}

export function scanStatusVocabulary(targets: readonly ScanTarget[]): readonly ScanViolation[] {
  const violations: ScanViolation[] = []

  for (const file of findFiles(targets)) {
    const normalized = file.replaceAll('\\', '/')
    if (isExcluded(normalized)) continue

    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const matches = new Set<string>()
    let firstMatch: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | undefined

    function visit(node: ts.Node): void {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        Object.hasOwn(STATUS_LITERALS, node.text)
      ) {
        matches.add(node.text)
        firstMatch ??= node
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    if (matches.size === 0 || firstMatch === undefined) continue

    const { line } = sourceFile.getLineAndCharacterOfPosition(firstMatch.getStart(sourceFile))
    const literals = [...matches].sort().join(', ')
    violations.push({
      file: normalized,
      line: line + 1,
      rule: 'status-vocabulary',
      message: literals,
      excerpt: literals,
    })
  }

  return violations
}

function isExcluded(file: string): boolean {
  return (
    file.includes('/_generated/') ||
    file.includes('.test.') ||
    file.endsWith('/routeTree.gen.ts') ||
    file.startsWith('src/lib/ui/contract-scans/') ||
    EXCLUDED_FILES[file] === true
  )
}
