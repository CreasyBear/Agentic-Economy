#!/usr/bin/env node
/**
 * Declared-surface drift audit (advisory only, always exits 0).
 *
 * AE's rule is that registration alone does not create a reachable route. This
 * script reports where a declared surface has no adapter evidence, which
 * writes are still legacy-unclassified, and which registered actions nothing
 * under src/routes or src/components references.
 *
 * Adapter evidence is a GREP-LEVEL HEURISTIC over source text, not a call
 * graph. A finding is a prompt to look, not a proof of unreachability.
 */

import { readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = process.cwd()

async function main() {
  const registry = await loadRegistry()
  const routeFiles = await collectSourceFiles(path.join(repoRoot, 'src/routes'))
  const componentFiles = await collectSourceFiles(path.join(repoRoot, 'src/components'))
  const moduleFiles = await collectSourceFiles(path.join(repoRoot, 'src/modules'))
  const serverLibFiles = await collectSourceFiles(path.join(repoRoot, 'src/lib/server'))
  const apiRouteFiles = [...routeFiles.filter((file) => path.basename(file).startsWith('api.')), ...serverLibFiles]

  const sources = new Map()
  for (const file of [...routeFiles, ...componentFiles, ...moduleFiles, ...serverLibFiles]) {
    sources.set(file, readFileSync(file, 'utf8'))
  }

  const missingAdapter = []
  const unclassifiedWrites = []
  const unreferenced = []

  for (const action of registry.listActions()) {
    const exportName = findExportName(moduleFiles, sources, action.id)
    const referencedIn = [...routeFiles, ...componentFiles, ...serverLibFiles].filter((file) =>
      mentionsAction(sources.get(file) ?? '', action.id, exportName),
    )

    if (action.surfaces.includes('http')) {
      const httpEvidence = apiRouteFiles.filter((file) => mentionsAction(sources.get(file) ?? '', action.id, exportName))
      if (httpEvidence.length === 0) {
        missingAdapter.push({ id: action.id, surface: 'http' })
      }
    }

    if (action.surfaces.includes('ui')) {
      const uiEvidence = referencedIn.filter((file) => !path.basename(file).startsWith('api.'))
      const serverFnEvidence = moduleFiles.filter(
        (file) => file.endsWith('.functions.ts') && mentionsAction(sources.get(file) ?? '', action.id, exportName),
      )
      if (uiEvidence.length === 0 && serverFnEvidence.length === 0) {
        missingAdapter.push({ id: action.id, surface: 'ui' })
      }
    }

    const contract = registry.resolveActionContract(action)
    if (!action.readOnly && action.invocationContract === undefined) {
      unclassifiedWrites.push({ id: action.id, consequenceClass: contract.consequenceClass })
    }

    if (referencedIn.length === 0) {
      unreferenced.push({ id: action.id })
    }
  }

  const total = registry.listActions().length
  process.stdout.write(`AE action surface audit (advisory; grep-level heuristic, exits 0)\n`)
  process.stdout.write(`Registered actions: ${total}\n\n`)

  report('Declared surface without adapter evidence (heuristic: no source text under src/routes, src/components, or src/lib/server names the action)', missingAdapter, (row) => `${row.id} declares '${row.surface}'`)
  report('Writes without an explicit invocation contract', unclassifiedWrites, (row) => `${row.id} (${row.consequenceClass})`)
  report('Registered but referenced nowhere under src/routes, src/components, or src/lib/server', unreferenced, (row) => row.id)

  process.stdout.write(
    `Summary: ${missingAdapter.length} missing-adapter, ${unclassifiedWrites.length} unclassified-write, ${unreferenced.length} unreferenced of ${total} actions.\n`,
  )
  process.exit(0)
}

function report(title, rows, format) {
  process.stdout.write(`${title}: ${rows.length}\n`)
  for (const row of rows) {
    process.stdout.write(`  - ${format(row)}\n`)
  }
  process.stdout.write('\n')
}

/** Actions are referenced by their exported const, not by their string id. */
function findExportName(moduleFiles, sources, actionId) {
  const pattern = new RegExp(`export const (\\w+) = defineAction\\(\\{[\\s\\S]{0,200}?id: '${actionId.replace('.', '\\.')}'`, 'u')
  for (const file of moduleFiles) {
    const match = pattern.exec(sources.get(file) ?? '')
    if (match?.[1] !== undefined) return match[1]
  }
  return undefined
}

function mentionsAction(source, actionId, exportName) {
  if (source.includes(`'${actionId}'`) || source.includes(`"${actionId}"`)) return true
  return exportName !== undefined && new RegExp(`\\b${exportName}\\b`, 'u').test(source)
}

async function collectSourceFiles(root) {
  const found = []
  try {
    for await (const file of glob(['**/*.ts', '**/*.tsx'], { cwd: root })) {
      const name = path.basename(file)
      if (!name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) found.push(path.join(root, file))
    }
  } catch {
    return found
  }

  return found.toSorted()
}

async function loadRegistry() {
  const { register } = await import('tsx/esm/api')
  const unregister = register()
  try {
    return await import(pathToFileURL(path.join(repoRoot, 'src/modules/actions/index.ts')).href)
  } finally {
    unregister()
  }
}

await main()
