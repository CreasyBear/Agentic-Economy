#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const BASE_REF = 'baf4c1dc7'
const COVERAGE_PATH = 'output/provider-connection-all-coverage/coverage-final.json'
const CRITICAL_FILES = [
  'convex/capabilityProviderConnectionLeases.ts',
  'convex/capabilityProviderConnectionLifecycle.ts',
  'convex/capabilityProviderConnectionOwner.ts',
  'convex/capabilityProviderConnections.ts',
  'src/modules/capability-supply/internal/provider-connection/lease.ts',
  'src/modules/capability-supply/internal/provider-connection/shared.ts',
  'src/modules/capability-supply/internal/provider-connection/types.ts',
  'src/modules/capability-supply/provider-connection.ts',
]

function addedLines(file) {
  const diff = execFileSync('git', ['diff', '--unified=0', '--no-color', BASE_REF, '--', file], {
    encoding: 'utf8',
  })
  const lines = new Set()
  for (const line of diff.split('\n')) {
    const match = /^@@ -(?:\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (match === null) continue
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset)
  }
  return lines
}

function rangeLines(location) {
  const lines = []
  for (let line = location.start.line; line <= location.end.line; line += 1) lines.push(line)
  return lines
}

function intersects(location, changed) {
  return rangeLines(location).some((line) => changed.has(line))
}

function percent(covered, total) {
  return total === 0 ? '100.00' : ((covered / total) * 100).toFixed(2)
}

function isExportOnlyModule(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  return source.statements.every((statement) => ts.isExportDeclaration(statement))
}

const coverage = JSON.parse(readFileSync(COVERAGE_PATH, 'utf8'))
const totals = {
  statements: { covered: 0, total: 0 },
  branches: { covered: 0, total: 0 },
  functions: { covered: 0, total: 0 },
  lines: { covered: 0, total: 0 },
}
const missing = []

for (const file of CRITICAL_FILES) {
  const absolute = resolve(file)
  const entry = coverage[absolute]
  const changed = addedLines(file)
  if (entry === undefined) {
    if (changed.size > 0 && isExportOnlyModule(file)) {
      console.log(`${file}: export-only module, 0 executable changed locations`)
    } else if (changed.size > 0) {
      missing.push(`${file}: missing coverage entry for ${changed.size} added lines`)
    }
    continue
  }

  const fileTotals = {
    statements: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 },
  }
  const changedStatements = Object.entries(entry.statementMap)
    .filter(([, location]) => intersects(location, changed))
  for (const [id, location] of changedStatements) {
    const hit = entry.s[id] > 0
    fileTotals.statements.total += 1
    fileTotals.statements.covered += Number(hit)
    if (!hit) missing.push(`${file}: statement ${id} ${location.start.line}:${location.start.column}-${location.end.line}:${location.end.column}`)
  }

  for (const [id, definition] of Object.entries(entry.fnMap)) {
    if (!intersects(definition.decl, changed) && !intersects(definition.loc, changed)) continue
    const hit = entry.f[id] > 0
    fileTotals.functions.total += 1
    fileTotals.functions.covered += Number(hit)
    if (!hit) missing.push(`${file}: function ${id} ${definition.name} ${definition.loc.start.line}:${definition.loc.start.column}`)
  }

  for (const [id, definition] of Object.entries(entry.branchMap)) {
    const branchChanged = intersects(definition.loc, changed)
      || definition.locations.some((location) => intersects(location, changed))
    if (!branchChanged) continue
    for (const [side, hits] of entry.b[id].entries()) {
      const hit = hits > 0
      fileTotals.branches.total += 1
      fileTotals.branches.covered += Number(hit)
      if (!hit) {
        const location = definition.locations[side] ?? definition.loc
        missing.push(`${file}: branch ${id}[${side}] ${location.start.line}:${location.start.column}-${location.end.line}:${location.end.column}`)
      }
    }
  }

  const executableChangedLines = [...changed].filter((line) => changedStatements.some(([, location]) => (
    line >= location.start.line && line <= location.end.line
  )))
  for (const line of executableChangedLines) {
    const statements = changedStatements.filter(([, location]) => line >= location.start.line && line <= location.end.line)
    const hit = statements.every(([id]) => entry.s[id] > 0)
    fileTotals.lines.total += 1
    fileTotals.lines.covered += Number(hit)
    if (!hit) missing.push(`${file}: executable line ${line}`)
  }

  for (const metric of Object.keys(totals)) {
    totals[metric].covered += fileTotals[metric].covered
    totals[metric].total += fileTotals[metric].total
  }
  console.log(`${file}: S ${fileTotals.statements.covered}/${fileTotals.statements.total} B ${fileTotals.branches.covered}/${fileTotals.branches.total} F ${fileTotals.functions.covered}/${fileTotals.functions.total} L ${fileTotals.lines.covered}/${fileTotals.lines.total}`)
}

console.log(`TOTAL: S ${totals.statements.covered}/${totals.statements.total} (${percent(totals.statements.covered, totals.statements.total)}%) B ${totals.branches.covered}/${totals.branches.total} (${percent(totals.branches.covered, totals.branches.total)}%) F ${totals.functions.covered}/${totals.functions.total} (${percent(totals.functions.covered, totals.functions.total)}%) L ${totals.lines.covered}/${totals.lines.total} (${percent(totals.lines.covered, totals.lines.total)}%)`)
if (missing.length > 0) {
  console.error('UNCOVERED CHANGED LOCATIONS:')
  for (const location of missing) console.error(`- ${location}`)
  process.exitCode = 1
}
