#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { kernelRetirementManifest } from './kernel-retirement-manifest.mjs'

export function verifyKernelRetirement(root = process.cwd()) {
  const errors = []
  const activeFiles = sourceFiles(root, ['src', 'convex', 'examples', 'tools', 'tests', 'docs'])
    .filter((path) => path !== 'src/lib/ui/contract-scans.ts')
    .filter((path) => !path.startsWith('tests/fixtures/'))
    .filter((path) => !path.endsWith('tests/imports/routing-authority-retirement.test.ts'))
    .filter((path) => !path.endsWith('tests/imports/routing-kernel-boundaries.test.ts'))
    .filter((path) => !path.endsWith('tests/imports/kernel-retirement-manifest.test.ts'))
    .filter((path) => !path.endsWith('tools/release/kernel-retirement-manifest.mjs'))
    .filter((path) => !path.endsWith('tools/release/verify-kernel-retirement.mjs'))
  const activeText = activeFiles.map((path) => [path, readFileSync(join(root, path), 'utf8')])

  for (const path of kernelRetirementManifest.retired.files) {
    if (existsSync(join(root, path))) errors.push(`retired_file_present:${path}`)
  }
  for (const [kind, values] of Object.entries({
    route: kernelRetirementManifest.retired.routes,
    table: kernelRetirementManifest.retired.tables,
    job: kernelRetirementManifest.retired.jobs,
    environment_key: kernelRetirementManifest.retired.environmentKeys,
    import: kernelRetirementManifest.retired.importTokens,
  })) {
    for (const value of values) {
      for (const [path, source] of activeText) {
        const present = kind === 'route' ? hasExactRouteReference(source, value) : source.includes(value)
        if (present) errors.push(`retired_${kind}_reference:${value}:${path}`)
      }
    }
  }

  const kernelFiles = sourceFiles(root, ['src/modules/routing-kernel', 'convex'])
    .filter((path) => path.includes('routingKernel') || path.includes('routing-kernel'))
  for (const retained of kernelRetirementManifest.retainedNonAuthority) {
    for (const path of retained.roots.flatMap((directory) => sourceFiles(root, [directory]))) {
      const source = readFileSync(join(root, path), 'utf8')
      if (/routing-kernel\/(?:application|runtime|internal)/.test(source)) {
        errors.push(`retained_domain_imports_kernel:${retained.domain}:${path}`)
      }
    }
    for (const path of kernelFiles) {
      const source = readFileSync(join(root, path), 'utf8')
      if (retained.roots.some((directory) => source.includes(directory.replace(/^src\//, '@/')))) {
        errors.push(`kernel_imports_retained_domain:${retained.domain}:${path}`)
      }
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() }
}

function hasExactRouteReference(source, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?![A-Za-z0-9_./-])`).test(source)
}

function sourceFiles(root, directories) {
  return directories.flatMap((directory) => walk(join(root, directory)))
    .filter((path) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|md)$/.test(path))
    .map((path) => relative(root, path))
    .filter((path) => !path.includes('/node_modules/') && !path.includes('/.git/'))
}

function walk(path) {
  if (!existsSync(path)) return []
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = verifyKernelRetirement()
  if (!result.ok) {
    console.error(JSON.stringify({ kind: 'kernel_retirement_refused', errors: result.errors }))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify({ kind: 'kernel_retirement_verified', schemaVersion: kernelRetirementManifest.schemaVersion }))
  }
}
