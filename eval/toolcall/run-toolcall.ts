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
import { executeWikipediaSummary } from './execute-keyless'

const { values } = parseArgs({
  options: {
    'live-model': { type: 'boolean', default: false },
    'live-execute': { type: 'boolean', default: false },
  },
  strict: false,
})

const WIKIPEDIA_CAPABILITY_ID = 'wikipedia-rest.page-summary'

function wikipediaContractOverrides() {
  return {
    contractFormat: 'ae.capability-contract:v2' as const,
    capabilityId: WIKIPEDIA_CAPABILITY_ID,
    version: 1,
    name: 'Wikipedia page summary',
    description: 'Returns a plain-text summary for a Wikipedia page through the keyless REST summary endpoint.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { title: { type: 'string', minLength: 1, maxLength: 300 } },
      required: ['title'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { title: { type: 'string' }, extract: { type: 'string' } },
      required: ['title', 'extract'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'title', document: 'input', pointer: '/title', label: 'Page title', role: 'request' },
      { annotationId: 'summary', document: 'output', pointer: '/extract', label: 'Page summary', role: 'completion_evidence' },
    ],
    dataUse: [{
      effectId: 'query_release', inputPointer: '/title', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_wikipedia_summary'],
    }],
    effects: [{
      effectId: 'query_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'not_applicable',
    }],
    evidence: [{ evidenceId: 'summary', outputPointer: '/extract', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  }
}

function buildModel(entry: CapabilityCatalogEntry): CapabilityDecisionModel {
  const document = capabilityContractV2({
    capabilityId: entry.capabilityId,
    name: entry.name,
    description: entry.description,
    ...(entry.capabilityId === WIKIPEDIA_CAPABILITY_ID ? wikipediaContractOverrides() : {}),
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
    const wikipediaCase = TOOLCALL_CASES.find((testCase) => testCase.executable === true)
    if (wikipediaCase === undefined) {
      failures.push('live-execute: no executable case found')
    } else {
      try {
        const { observation, validationKind } = await executeWikipediaSummary(wikipediaCase.input ?? {})
        if (observation.disposition === 'succeeded' && observation.outputJson !== undefined && validationKind === 'valid') {
          console.log(`live-execute ${wikipediaCase.id}: OK - real result ${observation.outputJson}`)
        } else {
          failures.push(`live-execute ${wikipediaCase.id}: disposition=${observation.disposition} validation=${validationKind} failure=${observation.failureCode ?? 'none'}`)
          logCase(wikipediaCase.id, false, 'live keyless execution failed')
        }
      } catch (error) {
        failures.push(`live-execute ${wikipediaCase.id}: threw ${error instanceof Error ? error.message : String(error)}`)
        logCase(wikipediaCase.id, false, 'live keyless execution threw')
      }
    }
  }

  console.log(`tool-call harness: ${TOOLCALL_CASES.length} cases, ${failures.length} failures`)
  return failures.length === 0
}

function logCase(id: string, pass: boolean, detail: string) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${detail}`)
}

const ok = await main()
if (!ok) process.exit(1)
