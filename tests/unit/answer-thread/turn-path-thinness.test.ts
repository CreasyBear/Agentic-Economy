import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const orchestratorSource = readFileSync(
  'src/modules/answer-thread/internal/turn-orchestrator.ts',
  'utf8',
)
const turnsRoot = 'src/modules/answer-thread/internal/turns'

const movedFunctionSymbols = [
  'streamClarificationTurn',
  'streamRetrievalFirstTurn',
  'streamInsufficientFrozenContextTurn',
  'streamFrozenKnownProviderTurn',
  'selectFrozenProviders',
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

const turnPathExports = [
  'clarificationTurnPath',
  'insufficientFrozenTurnPath',
  'frozenKnownTurnPath',
  'agentTurnPath',
  'inquiryHandoffTurnPath',
  'boundaryTurnPath',
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
  'readDurableFailureEvidence',
  'buildRationaleEvidence',
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

  it('keeps continuation/frozen-evidence helpers outside the orchestrator', () => {
    expect(orchestratorSource).toMatch(
      /from\s+['"]\.\/answer-continuation-state['"]/,
    )
    for (const symbol of continuationHelpers) {
      expect(orchestratorSource).not.toMatch(
        new RegExp(`(?:^|\\n)(?:export\\s+)?function\\s+${symbol}\\b`),
      )
      expect(orchestratorSource).toContain(symbol)
    }
    expect(orchestratorSource).not.toMatch(
      /(?:^|\n)(?:export\s+)?function\s+shouldOverrideOperationRouteForBusiness\b/,
    )
  })

  it('keeps effective route policy outside the orchestrator', () => {
    expect(orchestratorSource).toMatch(
      /from\s+['"]\.\/effective-answer-route['"]/,
    )
    expect(orchestratorSource).toContain('resolveEffectiveAnswerRoute')
    expect(orchestratorSource).not.toMatch(
      /(?:^|\n)(?:export\s+)?function\s+resolveEffectiveAnswerRoute\b/,
    )
  })

  it('imports TurnPath adapters from ./turns', () => {
    expect(orchestratorSource).toMatch(/from\s+['"]\.\/turns\//)
    for (const symbol of turnPathExports) {
      expect(orchestratorSource).toContain(symbol)
    }
    expect(orchestratorSource).toContain('selectFrozenProviders')
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

  it('keeps inquiry handoff inquiry-only', () => {
    const handoff = readFileSync(join(turnsRoot, 'inquiry-handoff.ts'), 'utf8')
    expect(handoff).toContain('resolveInquiryHandoff')
    expect(handoff).toContain('inquiryHandoffProviders')
    expect(handoff).toContain('buildInquiryHandoffNextStep')
    expect(handoff).not.toMatch(/customer-request|RoutePlan|mandate|approveRoute|compileRequest/i)
    expect(handoff).toContain('The business decides whether to accept it; timing, price, and availability are not confirmed yet')
  })
})


