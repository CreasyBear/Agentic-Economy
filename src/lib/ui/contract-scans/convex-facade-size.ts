import { readFileSync } from 'node:fs'
import { basename, relative, sep } from 'node:path'

import ts from 'typescript'

import {
  findFiles,
  type ScanTarget,
  type ScanViolation,
} from './file-discovery'

export type ConvexFacadeFile = Readonly<{
  file: string
  lines: number
  isFacade: boolean
}>

export type ConvexFacadeSizeScanResult = Readonly<{
  files: readonly ConvexFacadeFile[]
  violations: readonly ScanViolation[]
}>

export function scanConvexFacadeSizes(
  targets: readonly ScanTarget[],
  maxLines: number,
): ConvexFacadeSizeScanResult {
  const filesByPath = new Map<string, ConvexFacadeFile>()

  for (const target of targets) {
    for (const file of findFiles([target])) {
      if (!isEligibleDepthOneFile(file, target.root)) continue

      const contents = readFileSync(file, 'utf8')
      const normalizedFile = relative(process.cwd(), file).split(sep).join('/')
      filesByPath.set(normalizedFile, {
        file: normalizedFile,
        lines: contents.split('\n').length,
        isFacade: importsConvexServer(file, contents) && containsRpcDefinition(contents),
      })
    }
  }

  const files = [...filesByPath.values()].sort((left, right) =>
    left.file.localeCompare(right.file),
  )

  return {
    files,
    violations: files
      .filter(({ isFacade, lines }) => isFacade && lines > maxLines)
      .map(({ file, lines }) => ({
        file,
        line: 1,
        rule: 'convex-facade-size',
        message: `${file} has ${lines} lines; façade maximum is ${maxLines}`,
        excerpt: `${lines} lines`,
      })),
  }
}

function isEligibleDepthOneFile(file: string, root: string): boolean {
  const relativeToRoot = relative(root, file).split(sep).join('/')
  const name = basename(file)

  return (
    relativeToRoot !== '' &&
    !relativeToRoot.includes('/') &&
    !file.split(sep).includes('_generated') &&
    !name.endsWith('.test.ts') &&
    name !== 'convex.config.ts'
  )
}

function importsConvexServer(file: string, contents: string): boolean {
  const sourceFile = ts.createSourceFile(
    file,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === './_generated/server',
  )
}

function containsRpcDefinition(contents: string): boolean {
  return /\b(?:query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)\s*\(/.test(
    contents,
  )
}
