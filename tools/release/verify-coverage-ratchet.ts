import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import {
  assertCoverageRatchet,
  parseCoverageBaseline,
  parseCoveragePolicy,
  parseCoverageSummary,
} from './coverage-ratchet'
import { hasCoverageRelevantStatement } from './coverage-source-classification'

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
const baselinePath = resolve(root, argument('--baseline'))
const policyPath = resolve(root, argument('--policy'))
const [currentText, baselineText, policyText] = await Promise.all([
  readFile(currentPath, 'utf8'),
  readFile(baselinePath, 'utf8'),
  readFile(policyPath, 'utf8'),
])

const current = parseCoverageSummary(JSON.parse(currentText) as unknown, root)
const baseline = parseCoverageBaseline(JSON.parse(baselineText) as unknown)
const policy = parseCoveragePolicy(JSON.parse(policyText) as unknown)
const requiredCriticalFiles = (await Promise.all(policy.criticalPathPrefixes.map(async (prefix) => {
  const directory = resolve(root, prefix)
  try {
    if (!(await stat(directory)).isDirectory()) return []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const candidates = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name) && !entry.name.endsWith('.d.ts'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split('\\').join('/'))
  return (await Promise.all(candidates.map(async (path) => (
    hasCoverageRelevantStatement(path, await readFile(resolve(root, path), 'utf8')) ? path : undefined
  )))).filter((path): path is string => path !== undefined)
}))).flat()
assertCoverageRatchet(current, baseline, policy, requiredCriticalFiles)
process.stdout.write(`COVERAGE_RATCHET_PASS files=${Object.keys(current).length}\n`)
