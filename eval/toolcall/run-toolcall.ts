/**
 * Deterministic tool-call harness. Ranks the curated capability catalog by
 * discovery score and validates inputs against capability contracts.
 *
 * Run: `node tools/dev/run-with-cleanup.mjs tsx eval/toolcall/run-toolcall.ts`
 */

import { parseArgs } from 'node:util'

import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'

import {
  CAPABILITY_BY_ID,
  CAPABILITY_CATALOG,
  TOOLCALL_CASES,
  type CapabilityCatalogEntry,
} from './cases'

const { values } = parseArgs({
  options: {
    'live-model': { type: 'boolean', default: false },
    'live-execute': { type: 'boolean', default: false },
  },
  strict: false,
})

function buildModel(entry: CapabilityCatalogEntry): CapabilityDecisionModel {
  const document = capabilityContractV2({
    capabilityId: entry.capabilityId,
    name: entry.name,
    description: entry.description,
  })
  return openCapabilityDecisionModel(defineCapabilityContract(document))
}

const DISCOVERY_STOP_WORDS: Record<string, true> = {
  a: true, an: true, and: true, for: true, from: true, how: true, in: true, into: true,
  is: true, of: true, on: true, or: true, please: true, that: true, the: true, this: true,
  to: true, what: true, when: true, where: true, which: true, who: true, with: true,
}

function discoveryTokens(query: string): string[] {
  return (query.match(/[a-z0-9]+/gu) ?? []).filter((token) => DISCOVERY_STOP_WORDS[token] !== true)
}

function searchableText(entry: CapabilityCatalogEntry): string[] {
  return ([entry.name, entry.description, ...entry.searchTerms]
    .join(' ')
    .toLowerCase()
    .match(/[a-z0-9]+/gu) ?? [])
}

function tokenScore(terms: string[], token: string): number {
  return terms.reduce((best, term) => (
    term === token ? Math.max(best, 4)
      : term.startsWith(token) ? Math.max(best, 2)
        : term.includes(token) ? Math.max(best, 1) : best
  ), 0)
}

function discoveryScore(entry: CapabilityCatalogEntry, query: string): number {
  const terms = searchableText(entry)
  return discoveryTokens(query).reduce((total, token) => total + tokenScore(terms, token), 0)
}

function orderPoolByDiscovery(entries: readonly CapabilityCatalogEntry[], query: string): CapabilityCatalogEntry[] {
  const scored = entries.map((entry) => ({ entry, score: discoveryScore(entry, query) }))
  scored.sort((left, right) => (
    right.score !== left.score
      ? right.score - left.score
      : left.entry.capabilityId.localeCompare(right.entry.capabilityId)
  ))
  return scored.map(({ entry }) => entry)
}

async function main(): Promise<boolean> {
  const built: Record<string, CapabilityDecisionModel> = Object.fromEntries(
    CAPABILITY_CATALOG.map((entry) => [entry.capabilityId, buildModel(entry)]),
  )
  void values['live-model']

  const failures: string[] = []

  for (const testCase of TOOLCALL_CASES) {
    const poolEntries = testCase.pool
      .map((capabilityId) => CAPABILITY_BY_ID[capabilityId])
      .filter((entry): entry is CapabilityCatalogEntry => entry !== undefined)
    if (poolEntries.length !== testCase.pool.length) {
      failures.push(`${testCase.id}: pool references an unknown capability`)
      logCase(testCase.id, false, 'unknown capability in pool')
      continue
    }
    const ordered = orderPoolByDiscovery(poolEntries, testCase.request)
    const firstKeys = ordered.map((entry) => entry.capabilityId)
    const reasons: string[] = []

    if (testCase.expected !== undefined) {
      const matched = firstKeys.some((capabilityId) => testCase.expected?.includes(capabilityId))
      if (!matched) {
        reasons.push(`expected one of [${testCase.expected.join(', ')}] but ranked [${firstKeys.join(', ')}]`)
      }
      if (firstKeys.length === 0) reasons.push('expected a selection but got none')
      if (testCase.input !== undefined) {
        const selectedCapabilityId = firstKeys[0]
        const selectedModel = selectedCapabilityId === undefined ? undefined : built[selectedCapabilityId]
        if (selectedModel === undefined) {
          reasons.push('expected an input-validating operation but could not resolve its model')
        } else if (selectedModel.validateInput(testCase.input).kind !== 'valid') {
          reasons.push(`input ${JSON.stringify(testCase.input)} did not validate against ${selectedCapabilityId}`)
        }
      }
    } else {
      const executableSelected = firstKeys.some(
        (capabilityId) => CAPABILITY_BY_ID[capabilityId]?.executable === true,
      )
      if (executableSelected && testCase.expectedSelection === undefined) {
        reasons.push(`negative case produced an executable ranking: ${firstKeys.join(',')}`)
      }
      if (testCase.expectedSelection !== undefined) {
        const matched = firstKeys.some(
          (capabilityId) => testCase.expectedSelection?.includes(capabilityId),
        )
        if (!matched) reasons.push(`expected a non-executable ranking in [${testCase.expectedSelection.join(', ')}] but got [${firstKeys.join(', ')}]`)
      }
    }

    const pass = reasons.length === 0
    if (!pass) failures.push(...reasons.map((reason) => `${testCase.id}: ${reason}`))
    logCase(
      testCase.id,
      pass,
      `pool=[${testCase.pool.join(',')}] ranked=[${firstKeys.join(',')}]${reasons.length > 0 ? ` (${reasons[0]})` : ''}`,
    )
  }

  if (values['live-execute'] === true) {
    failures.push('live-execute: cluster keyless catalog is evicted; paid /call is parked')
  }

  console.log(`tool-call harness: ${TOOLCALL_CASES.length} cases, ${failures.length} failures`)
  return failures.length === 0
}

function logCase(id: string, pass: boolean, detail: string) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${detail}`)
}

const ok = await main()
if (!ok) process.exit(1)
