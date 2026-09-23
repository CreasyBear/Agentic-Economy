import { readFileSync } from 'node:fs'

import ts from 'typescript'

import {
  findFiles,
  type ScanTarget,
  type ScanViolation,
} from './file-discovery'

export type CopyVocabularyRule = Readonly<{
  id: string
  pattern: RegExp
  replacement: string
}>

type CopySegment = Readonly<{
  text: string
  start: number
}>

export function scanCopyVocabulary(
  targets: readonly ScanTarget[],
  rules: readonly CopyVocabularyRule[],
): readonly ScanViolation[] {
  const violations: ScanViolation[] = []
  const files = findFiles(targets).filter((file) => {
    const normalized = file.replaceAll('\\', '/')
    return !normalized.includes('src/lib/ui/contract-scans/') && !normalized.includes('.test.')
  })

  for (const file of files) {
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    for (const segment of copySegments(sourceFile)) {
      for (const rule of rules) {
        const flags = rule.pattern.flags.includes('g')
          ? rule.pattern.flags
          : `${rule.pattern.flags}g`
        for (const match of segment.text.matchAll(new RegExp(rule.pattern.source, flags))) {
          const matchIndex = match.index ?? 0
          const { line } = sourceFile.getLineAndCharacterOfPosition(segment.start + matchIndex)
          violations.push({
            file,
            line: line + 1,
            rule: rule.id,
            message: rule.replacement,
            excerpt: segment.text.trim().replaceAll(/\s+/g, ' '),
          })
        }
      }
    }
  }

  return violations
}

function copySegments(sourceFile: ts.SourceFile): readonly CopySegment[] {
  const segments: CopySegment[] = []

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) && !isImportPath(node)) {
      segments.push({ text: node.text, start: node.getStart(sourceFile) + 1 })
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      segments.push({ text: node.text, start: node.getStart(sourceFile) + 1 })
    } else if (ts.isJsxText(node)) {
      segments.push({ text: node.getText(sourceFile), start: node.getStart(sourceFile) })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return segments
}

function isImportPath(node: ts.StringLiteral): boolean {
  const { parent } = node
  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) {
    return true
  }
  if (ts.isExternalModuleReference(parent)) return true
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== node) return false

  return (
    parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(parent.expression) && parent.expression.text === 'require')
  )
}

