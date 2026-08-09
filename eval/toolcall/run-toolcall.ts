/**
 * Deterministic tool-call harness for the niche-marketplace MVP engine.
 *
 * Builds the descriptor pool from the curated capability catalog (mirroring the curated
 * publications' name/description/searchTerms/domain vocabulary), orders each case's pool by the
 * registry discovery score (re-implementing `operation-projection` score() semantics over the
 * descriptors' own discovery vocabulary), and runs `createConfiguredRequestInterpreter` (the
 * deterministic interpreter by default — no OPENROUTER key — so it is CI-safe and network-free).
 *
 * Positive cases assert the selected operation's capabilityId and determinism (run twice, same
 * selection) and that any supplied input validates against the operation's inputSchema. Negative
 * cases assert NO executable selection is produced (empty, or only a non-executable selection
 * like a keyed-without-credential op or an observed x402 listing). `--live-execute` additionally
 * runs the real keyless wikipedia case through `execute-keyless.ts`.
 *
 * Run: `node tools/dev/run-with-cleanup.mjs tsx eval/toolcall/run-toolcall.ts`
 */

import { parseArgs } from 'node:util'

import { createTestOperationLineage } from '@/../tests/helpers/customer-request-lineage'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import type { ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import {
  bindCustomerCapabilityDescriptor,
  type CustomerRequestCapabilityProposal,
  type CustomerRequestSemanticProposal,
} from '@/modules/customer-request/semantic-interpreter'
import { createConfiguredRequestInterpreter } from '@/modules/customer-request/application/interpret-compile'

import {
  CAPABILITY_BY_ID,
  CAPABILITY_CATALOG,
  TOOLCALL_CASES,
  type CapabilityCatalogEntry,
  type ToolCallCase,
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

// ---- wikipedia contract document (mirrors the curated publication's derived contract) -------

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

type BuiltDescriptor = ServerCapabilityDescriptor & { selectionKey: string }

// ---- descriptor construction (mirrors tests/unit/customer-request/live-pool-recovery.test.ts) --

function buildDescriptor(entry: CapabilityCatalogEntry): { descriptor: BuiltDescriptor; model: CapabilityDecisionModel } {
  const document = capabilityContractV2({
    capabilityId: entry.capabilityId,
    name: entry.name,
    description: entry.description,
    ...(entry.capabilityId === WIKIPEDIA_CAPABILITY_ID ? wikipediaContractOverrides() : {}),
  })
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  const descriptor = bindCustomerCapabilityDescriptor({
    operationRef: createTestOperationLineage(model.contractRef).operationRef,
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    name: entry.name,
    description: entry.description,
    inputs: model.inputs,
    valueSchemas: model.inputs.map((input) => ({
      inputKey: input.key,
      valueSchema: projectCapabilityInputValueSchema(document.inputSchema, input),
    })),
    evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    searchTerms: [...entry.searchTerms],
    ...(entry.domain === undefined ? {} : { domain: entry.domain }),
  }) as BuiltDescriptor
  return { descriptor, model }
}

// ---- discovery scoring (re-implements operation-projection score() over descriptor vocabulary) -

const DISCOVERY_STOP_WORDS: Record<string, true> = {
  a: true, an: true, and: true, for: true, from: true, how: true, in: true, into: true,
  is: true, of: true, on: true, or: true, please: true, that: true, the: true, this: true,
  to: true, what: true, when: true, where: true, which: true, who: true, with: true,
}

function discoveryTokens(query: string): string[] {
  return (query.match(/[a-z0-9]+/gu) ?? []).filter((token) => DISCOVERY_STOP_WORDS[token] !== true)
}

// The discovery vocabulary that ranks a pool is the same surface the eligibility gate and the
// selection loop tokenize: name + description + searchTerms (the registry-taught surface the
// curated source declares). The abilityId is deliberately excluded so the enrichment on the
// keyless variant's exact 'price' token is what differentiates it from the demo variant.
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

// ---- helpers --------------------------------------------------------------------------------

function selectionsOf(proposal: CustomerRequestSemanticProposal): readonly { capabilityId: string; operationRef: string }[] {
  if (proposal.kind !== 'capability_candidates') return []
  return (proposal as CustomerRequestCapabilityProposal).selections.map((selection) => ({
    capabilityId: selection.contractRef.capabilityId,
    operationRef: selection.operationRef,
  }))
}

// ---- main -----------------------------------------------------------------------------------

async function main(): Promise<boolean> {
  const built: Record<string, { descriptor: BuiltDescriptor; model: CapabilityDecisionModel }> = Object.fromEntries(
    CAPABILITY_CATALOG.map((entry) => [entry.capabilityId, buildDescriptor(entry)]),
  )

  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  const liveModel = values['live-model'] === true && apiKey !== undefined && apiKey.length > 0
  const interpreter = createConfiguredRequestInterpreter({
    ...(liveModel ? { openRouterApiKey: apiKey, modelName: process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-5-mini' } : {}),
    maximumDescriptorBytes: 512_000,
  })

  const failures: string[] = []

  for (const testCase of TOOLCALL_CASES) {
    const poolEntries = testCase.pool
      .map((capabilityId) => CAPABILITY_BY_ID[capabilityId])
      .filter((entry): entry is CapabilityCatalogEntry => entry !== undefined)
    if (poolEntries.length !== testCase.pool.length) {
      failures.push(`${testCase.id}: pool references an unknown capability`)
      logCase(testCase.id, false, `unknown capability in pool`)
      continue
    }
    const ordered = orderPoolByDiscovery(poolEntries, testCase.request)
    const capabilities = ordered
      .map((entry) => built[entry.capabilityId]?.descriptor)
      .filter((descriptor): descriptor is BuiltDescriptor => descriptor !== undefined)

    const first = await interpreter.propose({ customerJob: testCase.request, capabilities })
    const second = await interpreter.propose({ customerJob: testCase.request, capabilities })
    const firstSelections = selectionsOf(first)
    const secondSelections = selectionsOf(second)

    const reasons: string[] = []

    // Determinism: the same request twice must select the same operations in the same order.
    const firstKeys = firstSelections.map((selection) => selection.capabilityId)
    const secondKeys = secondSelections.map((selection) => selection.capabilityId)
    if (firstKeys.join('|') !== secondKeys.join('|')) {
      reasons.push(`non-deterministic selection: ${firstKeys.join(',')} vs ${secondKeys.join(',')}`)
    }

    if (testCase.expected !== undefined) {
      // Positive: at least one selection must match an accepted capabilityId.
      const matched = firstSelections.some((selection) => testCase.expected?.includes(selection.capabilityId))
      if (!matched) {
        reasons.push(`expected one of [${testCase.expected.join(', ')}] but selected [${firstKeys.join(', ')}]`)
      }
      if (firstSelections.length === 0) reasons.push('expected a selection but got none')
      // Contract-valid input: any supplied input must validate against the selected op's schema.
      if (testCase.input !== undefined) {
        const selectedCapabilityId = firstSelections[0]?.capabilityId
        const selectedModel = selectedCapabilityId === undefined ? undefined : built[selectedCapabilityId]?.model
        if (selectedModel === undefined) {
          reasons.push('expected an input-validating operation but could not resolve its model')
        } else if (selectedModel.validateInput(testCase.input).kind !== 'valid') {
          reasons.push(`input ${JSON.stringify(testCase.input)} did not validate against ${selectedCapabilityId}`)
        }
      }
    } else {
      // Negative: no EXECUTABLE selection (empty, or only a non-executable selection). Optionally a
      // specific non-executable selection is still expected (keyed serpapi).
      const executableSelected = firstSelections.some(
        (selection) => CAPABILITY_BY_ID[selection.capabilityId]?.executable === true,
      )
      if (executableSelected) reasons.push(`negative case produced an executable selection: ${firstKeys.join(',')}`)
      if (testCase.expectedSelection !== undefined) {
        const matched = firstSelections.some(
          (selection) => testCase.expectedSelection?.includes(selection.capabilityId),
        )
        if (!matched) reasons.push(`expected a non-executable selection in [${testCase.expectedSelection.join(', ')}] but got [${firstKeys.join(', ')}]`)
      }
    }

    const pass = reasons.length === 0
    if (!pass) failures.push(...reasons.map((reason) => `${testCase.id}: ${reason}`))
    logCase(
      testCase.id,
      pass,
      `pool=[${testCase.pool.join(',')}] selected=[${firstKeys.join(',')}]${reasons.length > 0 ? ` (${reasons[0]})` : ''}`,
    )
  }

  // Optional live keyless execution: proves selection -> real endpoint -> real result.
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
