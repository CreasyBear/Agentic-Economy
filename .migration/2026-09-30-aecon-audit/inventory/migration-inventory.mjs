#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `Usage: node migration-inventory.mjs [--run <folder>] [--root <dir>] [--paths "<glob[;glob...]>" ] [--check] [--pin]

Scans routed UI source under src/ and convex/moneyDocumentRender.ts. The run folder must be under the selected root.
Outputs inventory/current.tsv and inventory/counts.txt. --check exits 1 while findings remain; --pin records the root HEAD.
Allowlist TSV: file<TAB>match<TAB>reason<TAB>owner<TAB>remove_by. This audit has no allowlisted rows.`

function parseArgs(argv) {
  const parsed = { run: undefined, root: undefined, paths: undefined, check: false, pin: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--check') parsed.check = true
    else if (arg === '--pin') parsed.pin = true
    else if (arg === '--run' || arg === '--root' || arg === '--paths') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      parsed[arg.slice(2)] = value
      index += 1
    } else throw new Error(`Unknown flag: ${arg}`)
  }
  return parsed
}

function readLines(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
}

function globRegExp(glob) {
  let expression = '^'
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*' && glob[index + 1] === '*') {
      expression += '.*'
      index += 1
    } else if (char === '*') expression += '[^/]*'
    else if (char === '?') expression += '[^/]'
    else expression += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(`${expression}$`)
}

function isIgnored(file, ignores) {
  return ignores.some((pattern) => globRegExp(pattern).test(file))
}

function walk(directory, root, output) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'build') walk(absolute, root, output)
    } else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join('/'))
  }
}

function sourceFiles(root) {
  const files = []
  walk(path.join(root, 'src'), root, files)
  const documentRenderer = path.join(root, 'convex/moneyDocumentRender.ts')
  if (existsSync(documentRenderer)) files.push('convex/moneyDocumentRender.ts')
  return files
}

function readQueue(file) {
  const lines = readFileSync(file, 'utf8').trimEnd().split(/\r?\n/)
  const header = lines.shift().split('\t')
  return lines.filter(Boolean).map((line) => {
    const values = line.split('\t')
    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']))
  })
}

function matchSurface(file, queue) {
  const matches = queue.filter((row) => row.paths.split(';').some((pattern) => globRegExp(pattern.trim()).test(file)))
  return matches.length === 1 ? matches[0].surface : matches.length === 0 ? 'UNASSIGNED' : `OVERLAP:${matches.map((row) => row.surface).join(',')}`
}

function isRawArbitrary(className) {
  const start = className.lastIndexOf('-[')
  const body = className.slice(start + 2, -1)
  if (/^(?:var\(|counter\(|attr\()/i.test(body.trim())) return false
  if (/^(?:opacity|display|position|visibility|pointer-events|overflow|object|cursor|select|transition|content|font-family)-/i.test(className)) return false
  return /(?:\d+(?:\.\d+)?\s*(?:px|rem|em|%|vw|vh|svh|dvh|lvh|ch|ex|fr|ms|s|deg|turn)|#[0-9a-f]{3,8}\b|\b(?:calc|minmax|clamp|fit-content|repeat|rgb|hsl|oklch)\s*\(|^\d+(?:\.\d+)?$)/i.test(body)
}

function collectRows(root, runFolder, ignores, legacySpecs, queue, onlyPaths) {
  const rows = []
  const files = sourceFiles(root).filter((file) => !isIgnored(file, ignores))
  const pathFilter = onlyPaths?.split(';').map((pattern) => globRegExp(pattern.trim()))
  for (const file of files) {
    if (pathFilter && !pathFilter.some((pattern) => pattern.test(file))) continue
    const surface = matchSurface(file, queue)
    const text = readFileSync(path.join(root, file), 'utf8')
    const lines = text.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const colorMatches = [...line.matchAll(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|\b(?:rgba?|hsla?|hwb|oklch|oklab)\([^)]*\)/gi)]
      const arbitraryMatches = [...line.matchAll(/\b(?:[A-Za-z0-9_-]+:)*!?[A-Za-z0-9_-]+-\[[^\]\s]+\]/g)]
      const arbitrarySpans = []
      for (const match of arbitraryMatches) {
        const candidate = match[0]
        if (!isRawArbitrary(candidate)) continue
        arbitrarySpans.push([match.index, match.index + candidate.length])
        rows.push({ kind: 'raw', file, line: index + 1, match: `arbitrary:${candidate}`, surface })
      }
      for (const match of colorMatches) {
        const start = match.index
        if (arbitrarySpans.some(([left, right]) => start >= left && start < right)) continue
        rows.push({ kind: 'raw', file, line: index + 1, match: `color:${match[0]}`, surface })
      }

      const cssClassColors = [...line.matchAll(/\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder)-(black|white)(?:\/(?:\d{1,3}|\[[^\]]+\]))?\b/g)]
      for (const match of cssClassColors) rows.push({ kind: 'raw', file, line: index + 1, match: `color-class:${match[0]}`, surface })

      const paletteMatches = [...line.matchAll(/\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?\b/g)]
      for (const match of paletteMatches) rows.push({ kind: 'palette', file, line: index + 1, match: match[0], surface })

      const declarationPattern = /(?:^|[;{}])\s*([a-z-]+)\s*:\s*([^;{}]+)/g
      for (const match of line.matchAll(declarationPattern)) {
        const property = match[1].toLowerCase()
        const value = match[2].trim().replace(/\s*\*\/$/, '')
        if (!/^(?:padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?|gap|row-gap|column-gap|inset(?:-[a-z-]+)?|top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|border-radius|font-size|font-weight|line-height|letter-spacing|box-shadow|outline-offset|outline-width|border-width|transition-duration|animation-duration|z-index|opacity)$/.test(property)) continue
        if (/^(?:var\(|inherit\b|initial\b|unset\b|auto\b|normal\b|none\b)/i.test(value)) continue
        if (!/(?:\d+(?:\.\d+)?\s*(?:px|rem|em|%|vw|vh|svh|dvh|lvh|ch|ex|fr|ms|s|deg|turn)|(?:calc|minmax|clamp|fit-content)\s*\(|^\d+(?:\.\d+)?$)/i.test(value)) continue
        if (/^0(?:\s*(?:0|px|rem|em|%))*$/i.test(value)) continue
        rows.push({ kind: 'raw', file, line: index + 1, match: `css:${property}:${value}`, surface })
      }

      if (legacySpecs.length > 0) {
        const importPattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|@import\s*)(['"])([^'"]+)\1/g
        for (const match of line.matchAll(importPattern)) {
          for (const spec of legacySpecs) {
            if (spec.kind === 'module' && globRegExp(spec.value).test(match[2])) rows.push({ kind: 'import', file, line: index + 1, match: match[2], surface })
          }
        }
      }
    }
  }
  for (const spec of legacySpecs) {
    if (spec.kind !== 'path') continue
    const expression = globRegExp(spec.value)
    for (const file of files) if (expression.test(file)) rows.push({ kind: 'file', file, line: '-', match: '-', surface: matchSurface(file, queue) })
  }
  return rows
}

function parseLegacy(file) {
  return readLines(file).map((line) => {
    const [kind, ...rest] = line.split(/\s+/)
    return { kind, value: rest.join(' ') }
  }).filter((entry) => ['module', 'path'].includes(entry.kind) && entry.value)
}

function writeOutputs(runFolder, rows, counts) {
  const header = 'kind\tfile\tline\tmatch\tsurface\n'
  const sorted = rows.sort((left, right) => left.file.localeCompare(right.file) || Number(left.line) - Number(right.line) || left.kind.localeCompare(right.kind) || left.match.localeCompare(right.match))
  writeFileSync(path.join(runFolder, 'inventory/current.tsv'), header + sorted.map((row) => [row.kind, row.file, row.line, row.match, row.surface].join('\t')).join('\n') + '\n')
  const countText = ['Inventory source: src/ plus convex/moneyDocumentRender.ts; token source, system component directory, tests, docs, build output and check tooling excluded.',
    `imports ${counts.imports}`, `raw ${counts.raw}`, `palette ${counts.palette}`, `files ${counts.files}`,
    `unassigned ${counts.unassigned}`, `overlaps ${counts.overlaps}`, `source_files ${counts.sourceFiles}`,
    `legacy_spec ${counts.legacySpecs ? 'present' : 'empty; current system has no registry replacement/migration map'}`].join('\n') + '\n'
  writeFileSync(path.join(runFolder, 'inventory/counts.txt'), countText)
}

function main() {
  let options
  try { options = parseArgs(process.argv.slice(2)) } catch (error) { console.error(`${error.message}\n${usage}`); process.exit(2) }
  if (options.help) { console.log(usage); process.exit(2) }
  const scriptFolder = path.dirname(fileURLToPath(import.meta.url))
  const defaultRun = path.resolve(scriptFolder, '..')
  const runFolder = realpathSync(options.run ?? defaultRun)
  let inferredRoot
  if (options.root === undefined) {
    try {
      inferredRoot = execFileSync('git', ['-C', runFolder, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    } catch {
      inferredRoot = process.cwd()
    }
  }
  const rootCandidate = options.root ?? inferredRoot
  const root = realpathSync(rootCandidate)
  if (runFolder !== root && !runFolder.startsWith(`${root}${path.sep}`)) {
    console.error(`Run folder ${runFolder} is outside root ${root}; pass --root for the app repo.`)
    process.exit(3)
  }
  if (!existsSync(path.join(runFolder, 'inventory/legacy.txt')) || !existsSync(path.join(runFolder, 'queue.tsv'))) {
    console.error(`Run folder ${runFolder} is missing inventory/legacy.txt or queue.tsv.`)
    process.exit(2)
  }
  const ignoreFile = path.join(runFolder, 'inventory/ignore.txt')
  const ignores = existsSync(ignoreFile) ? readLines(ignoreFile).map((line) => line.split(/\s+#/, 1)[0].trim()).filter(Boolean) : []
  const legacySpecs = parseLegacy(path.join(runFolder, 'inventory/legacy.txt'))
  const queue = readQueue(path.join(runFolder, 'queue.tsv'))
  const rows = collectRows(root, runFolder, ignores, legacySpecs, queue, options.paths)
  const sourceFilesCount = sourceFiles(root).filter((file) => !isIgnored(file, ignores)).length
  if (sourceFilesCount === 0) {
    console.error(`Scan read no source files under ${root}; pass --root for the app repo.`)
    process.exit(3)
  }
  const countKind = (kind) => rows.filter((row) => row.kind === kind).length
  const counts = { imports: countKind('import'), raw: countKind('raw'), palette: countKind('palette'), files: countKind('file'),
    unassigned: rows.filter((row) => row.surface === 'UNASSIGNED').length,
    overlaps: rows.filter((row) => row.surface.startsWith('OVERLAP:')).length,
    sourceFiles: sourceFilesCount, legacySpecs: legacySpecs.length }
  if (options.paths) {
    console.log(`${counts.imports} ${counts.raw} ${counts.palette} ${counts.files} (unassigned ${counts.unassigned}, overlaps ${counts.overlaps})`)
  } else {
    mkdirSync(path.join(runFolder, 'inventory'), { recursive: true })
    writeOutputs(runFolder, rows, counts)
    console.log(`Inventory: ${counts.imports} imports, ${counts.raw} raw, ${counts.palette} palette, ${counts.files} files; ${counts.unassigned} unassigned; ${counts.overlaps} overlaps.`)
  }
  if (options.pin) {
    const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeFileSync(path.join(runFolder, 'inventory/pin.txt'), `${commit}\n`)
    console.log(`Pinned HEAD ${commit}`)
  }
  if (options.check && (counts.imports + counts.raw + counts.palette + counts.files > 0 || counts.unassigned > 0 || counts.overlaps > 0)) process.exit(1)
}

main()
