import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { copyReleaseSource, runConvexCommand, terminateIsolatedProcesses } from './convex-anonymous-runtime'

const root = resolve(process.cwd())
const generatedDirectory = join('convex', '_generated')
const generatedSourceFiles = ['api.d.ts', 'api.js', 'dataModel.d.ts', 'server.d.ts', 'server.js'] as const
const anonymousClerkJwtIssuerDomain = 'https://release-proof.invalid'

function listFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path))
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(path)
  }
  return files
}

function generatedDrift(isolatedRoot: string): string[] {
  const expectedRoot = resolve(root, generatedDirectory)
  const observedRoot = resolve(isolatedRoot, generatedDirectory)
  const expected = new Map(listFiles(expectedRoot).map((path) => [relative(expectedRoot, path), path]))
  const observed = new Map(listFiles(observedRoot).map((path) => [relative(observedRoot, path), path]))
  const names = [...new Set([...expected.keys(), ...observed.keys()])].sort()
  return names.filter((name) => {
    const expectedPath = expected.get(name)
    const observedPath = observed.get(name)
    if (expectedPath === undefined || observedPath === undefined) return true
    const expectedStat = lstatSync(expectedPath)
    const observedStat = lstatSync(observedPath)
    if (expectedStat.isSymbolicLink() !== observedStat.isSymbolicLink()) return true
    return !readFileSync(expectedPath).equals(readFileSync(observedPath))
  })
}

async function run(): Promise<void> {
  const isolatedRoot = mkdtempSync(resolve(tmpdir(), 'ae-convex-source-proof-'))
  let generatedCount = 0
  try {
    copyReleaseSource(root, isolatedRoot)
    for (const name of generatedSourceFiles) {
      rmSync(resolve(isolatedRoot, generatedDirectory, name))
    }
    await runConvexCommand({ sourceRoot: root, isolatedRoot, args: ['init'] })
    await runConvexCommand({ sourceRoot: root, isolatedRoot, args: ['env', 'set', 'AE_DEPLOYMENT_ENVIRONMENT', 'development'] })
    await runConvexCommand({ sourceRoot: root, isolatedRoot, args: [
      'env',
      'set',
      'CLERK_JWT_ISSUER_DOMAIN',
      anonymousClerkJwtIssuerDomain,
    ] })
    await runConvexCommand({ sourceRoot: root, isolatedRoot, args: ['codegen', '--typecheck=disable'] })
    for (const name of generatedSourceFiles) {
      if (!existsSync(resolve(isolatedRoot, generatedDirectory, name))) {
        throw new Error(`convex_generated_source_missing:${name}`)
      }
    }
    const drift = generatedDrift(isolatedRoot)
    if (drift.length > 0) {
      throw new Error(`convex_generated_source_drift:${drift.join(',')}`)
    }
    generatedCount = listFiles(resolve(isolatedRoot, generatedDirectory)).length
  } finally {
    await terminateIsolatedProcesses(isolatedRoot)
    rmSync(isolatedRoot, { recursive: true, force: true })
  }
  process.stdout.write(`CONVEX_ANONYMOUS_CODEGEN_PASS files=${generatedCount}\n`)
}

await run()
