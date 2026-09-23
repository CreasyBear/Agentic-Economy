import { readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

import { findFiles, type ScanViolation } from './file-discovery'

export function scanOwnBarrelImports(modulesRoot = 'src/modules'): readonly ScanViolation[] {
  const absoluteModulesRoot = resolve(modulesRoot)
  const violations: ScanViolation[] = []
  const files = findFiles([
    { root: modulesRoot, includeExtensions: ['.ts', '.tsx', '.fixture'] },
  ]).filter((file) => !file.includes('.test.'))

  for (const file of files) {
    const absoluteFile = resolve(file)
    const moduleRelativePath = relative(absoluteModulesRoot, absoluteFile)
    const pathParts = moduleRelativePath.split(sep)
    if (pathParts.length < 3 || pathParts[1] !== 'internal') continue

    const moduleName = pathParts[0]
    if (moduleName === undefined) continue
    const sourceText = readFileSync(absoluteFile, 'utf8')
    const sourceFile = ts.createSourceFile(
      absoluteFile,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue

      const specifier = statement.moduleSpecifier.text
      if (!resolvesToOwnBarrel(specifier, absoluteFile, absoluteModulesRoot, moduleName)) continue

      const { line } = sourceFile.getLineAndCharacterOfPosition(
        statement.moduleSpecifier.getStart(sourceFile),
      )
      violations.push({
        file: relative(process.cwd(), absoluteFile).split(sep).join('/'),
        line: line + 1,
        rule: 'own-barrel-import',
        message: `Internal module imports its own barrel via "${specifier}".`,
        excerpt: sourceText.split('\n')[line]?.trim() ?? '',
      })
    }
  }

  return violations
}

function resolvesToOwnBarrel(
  specifier: string,
  importingFile: string,
  modulesRoot: string,
  moduleName: string,
): boolean {
  const aliasMatch = /^@\/modules\/([^/]+)\/(public|index)(?:\.js)?$/.exec(specifier)
  if (aliasMatch !== null) return aliasMatch[1] === moduleName
  if (!specifier.startsWith('.')) return false

  const resolvedImport = resolve(dirname(importingFile), specifier.replace(/\.js$/, ''))
  const moduleRoot = resolve(modulesRoot, moduleName)
  return resolvedImport === resolve(moduleRoot, 'public') || resolvedImport === resolve(moduleRoot, 'index')
}
