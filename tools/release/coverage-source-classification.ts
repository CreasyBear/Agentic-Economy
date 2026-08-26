import ts from 'typescript'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function declaredOnly(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement)
    && (ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.DeclareKeyword) ?? false)
}

/** True when Istanbul can reasonably be expected to emit counters for a TS source file. */
export function hasCoverageRelevantStatement(path: string, source: string): boolean {
  const scriptKind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind)
  return sourceFile.statements.some((statement) => {
    if (ts.isImportDeclaration(statement)
      || ts.isImportEqualsDeclaration(statement)
      || ts.isExportDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || ts.isEmptyStatement(statement)) return false
    return !declaredOnly(statement)
  })
}

export async function filterCoverageRelevantPaths(root: string, paths: readonly string[]): Promise<string[]> {
  const classified = await Promise.all(paths.map(async (path) => (
    hasCoverageRelevantStatement(path, await readFile(resolve(root, path), 'utf8')) ? path : undefined
  )))
  return classified.filter((path): path is string => path !== undefined)
}
