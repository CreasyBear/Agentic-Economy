import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const orchestratorSource = readFileSync(
  'src/modules/answer-thread/internal/turn-orchestrator.ts',
  'utf8',
)
const turnPhasesSource = readFileSync(
  'src/modules/answer-thread/internal/answer-turn-phases.ts',
  'utf8',
)
const turnsRoot = 'src/modules/answer-thread/internal/turns'

const movedFunctionSymbols = [
  'streamClarificationTurn',
  'streamRetrievalFirstTurn',
  'streamInsufficientFrozenContextTurn',
  'streamFrozenKnownProviderTurn',
  'streamAgentTurn',
  'resequenceToolCalls',
  'streamInquiryHandoffTurn',
  'describeInquiryHandoffResolution',
  'describeInquiryPath',
  'inquiryPathLabel',
  'streamBoundaryTurn',
  'buildInitialRegistrySearchInput',
  'buildRetrievalFirstSnapshot',
  'buildDeterministicEmptySnapshot',
  'shouldReturnDeterministicEmptyState',
  'withFollowUpLayout',
  'rejectBlockedSnapshot',
] as const

const retiredRouteSymbols = [
  'clarificationTurnPath',
  'retrievalFirstTurnPath',
  'insufficientFrozenTurnPath',
  'frozenKnownTurnPath',
  'inquiryHandoffTurnPath',
  'selectFrozenProviders',
  'resolveEffectiveAnswerRoute',
  'EffectiveAnswerRoute',
  'resolveIntentRoute',
  'IntentRoute',
] as const

const continuationHelpers = [
  'selectedInputDigestFor',
  'pendingDecisionFor',
  'readPriorContinuationState',
  'priorTurnStatus',
  'priorTurnOperation',
  'latestPriorOperationPresentation',
  'readOperationInputFromToolCalls',
  'readPriorOperationInput',
  'readPriorSearchContext',
] as const

describe('answer-thread turn-path thinness', () => {
  it('does not redefine moved turn-path bodies in the orchestrator', () => {
    expect(orchestratorSource).toMatch(/(?:^|\n)\s*(?:export\s+)?async function streamAnswerTurn\b/)
    expect(orchestratorSource).toMatch(/(?:^|\n)\s*function buildStreamAnswerTurnPhases\b/)

    for (const symbol of movedFunctionSymbols) {
      expect(orchestratorSource).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(orchestratorSource).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps continuation/frozen-evidence helpers imported from continuation state', () => {
    const continuationImports = [orchestratorSource, turnPhasesSource]
      .map((source) => source.match(
        /import\s+\{([\s\S]*?)\}\s+from\s+['"]\.\/answer-continuation-state['"]/,
      )?.[1] ?? '')
      .join('\n')
    expect(continuationImports).not.toBe('')

    for (const symbol of continuationHelpers) {
      expect(continuationImports).toContain(symbol)
      expect(orchestratorSource).not.toMatch(
        new RegExp(`(?:^|\\n)(?:export\\s+)?function\\s+${symbol}\\b`),
      )
    }
    expect(orchestratorSource).not.toMatch(
      /(?:^|\n)(?:export\s+)?function\s+shouldOverrideOperationRouteForBusiness\b/,
    )
  })

  it('imports and calls only the live agent and boundary turn paths', () => {
    expect(orchestratorSource).toMatch(
      /import\s+\{\s*agentTurnPath,\s*readOperationArtifacts\s*\}\s+from\s+['"]\.\/turns\/agent['"]/,
    )
    expect(orchestratorSource).toMatch(
      /import\s+\{\s*boundaryTurnPath\s*\}\s+from\s+['"]\.\/turns\/boundary['"]/,
    )

    for (const symbol of ['agentTurnPath', 'boundaryTurnPath'] as const) {
      expect(orchestratorSource).toMatch(new RegExp(`\\b${symbol}\\.run\\(`))
    }

    const adapterSymbols = orchestratorSource.match(/\b[A-Za-z]+TurnPath\b/g) ?? []
    expect([...new Set(adapterSymbols)].sort()).toEqual(['agentTurnPath', 'boundaryTurnPath'])
  })

  it('rejects retired adapter and router symbols', () => {
    for (const symbol of retiredRouteSymbols) {
      expect(orchestratorSource).not.toContain(symbol)
    }
  })

  it('keeps turns/** free of Customer Request / RoutePlan authority and Convex runtime', () => {
    for (const file of listTsFiles(turnsRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"][^'"]*customer-request[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*routing-kernel[^'"]*['"]/)
      expect(source).not.toMatch(/\bRoutePlan\b/)
      expect(source).not.toMatch(/\bprepareStructuredQuotes\b/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
    }
  })
})
