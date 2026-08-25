import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createCoverageBaseline, parseCoverageSummary } from './coverage-ratchet'

function argument(name: string): string {
  const index = process.argv.indexOf(name)
  const value = process.argv[index + 1]
  if (index === -1 || value === undefined || value.startsWith('--')) {
    throw new Error(`missing_argument:${name}`)
  }
  return value
}

const root = resolve(process.cwd())
const currentPath = resolve(root, argument('--current'))
const outputPath = resolve(root, argument('--output'))
const current = parseCoverageSummary(
  JSON.parse(await readFile(currentPath, 'utf8')) as unknown,
  root,
)
const baseline = createCoverageBaseline(current)
await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
process.stdout.write(`COVERAGE_BASELINE_CREATED files=${Object.keys(baseline.files).length}\n`)
