import type {
  DecisionGatewayRequest,
  DecisionGatewayResponse,
  JevAnswer,
  JevChoiceAnswer,
  JevNoulAnswer,
  JevScoreAnswer,
} from './contracts'

function entryToSearchText(entry: unknown): string {
  if (entry === null || entry === undefined) return ''
  if (typeof entry === 'string') return entry.toLowerCase()
  try {
    return JSON.stringify(entry).toLowerCase()
  } catch {
    return ''
  }
}

export function callDeterministicRuleEngine(
  request: DecisionGatewayRequest,
): DecisionGatewayResponse {
  const startedAt = Date.now()
  const stateText = entryToSearchText(request.state)

  const answers: Record<string, JevAnswer> = {}
  const hasErrorTokens =
    stateText.includes('error') ||
    stateText.includes('timeout') ||
    stateText.includes('failed') ||
    stateText.includes('etimeout') ||
    stateText.includes('econnrefused') ||
    stateText.includes('econnreset') ||
    stateText.includes('500') ||
    stateText.includes('502') ||
    stateText.includes('503') ||
    stateText.includes('504') ||
    stateText.includes('exception') ||
    stateText.includes('rate limit')

  for (const [qKey, qVal] of Object.entries(request.questions)) {
    if (qVal.type === 'choice') {
      let bestChoice = 'unsupported'
      let maxScore = 0

      // Special case for faultParty / status choices
      if (qVal.criteria.upstream_provider !== undefined && qVal.criteria.none !== undefined) {
        if (hasErrorTokens) {
          bestChoice = 'upstream_provider'
          maxScore = 10
        } else {
          bestChoice = 'none'
          maxScore = 10
        }
      } else {
        for (const [choiceKey, criteriaDesc] of Object.entries(qVal.criteria)) {
          if (choiceKey === 'unsupported' || choiceKey === 'none_matched') continue
          let score = 0
          const keyTokens = choiceKey.toLowerCase().split(/[_:./-]+/)
          for (const token of keyTokens) {
            if (token.length > 2 && stateText.includes(token)) {
              score += 3
            }
          }
          if (criteriaDesc) {
            const descTokens = entryToSearchText(criteriaDesc).split(/\s+/)
            for (const token of descTokens) {
              const cleanToken = token.replace(/[^a-z0-9]/g, '')
              if (cleanToken.length > 3 && stateText.includes(cleanToken)) {
                score += 1
              }
            }
          }

          if (score > maxScore) {
            maxScore = score
            bestChoice = choiceKey
          }
        }
      }

      const confidence =
        maxScore > 0 ? Math.min(0.75 + maxScore * 0.03, 0.98) : 0.0
      const ans: JevChoiceAnswer = {
        type: 'choice',
        choice: bestChoice,
        probabilities: { [bestChoice]: confidence },
        confidence,
      }
      answers[qKey] = ans
    } else if (qVal.type === 'noul') {
      const inst = entryToSearchText(qVal.instructions)
      const isErrorQuestion =
        inst.includes('error') ||
        inst.includes('failure') ||
        inst.includes('crash') ||
        inst.includes('timeout')

      let noul = 0.5
      if (isErrorQuestion) {
        noul = hasErrorTokens ? 0.95 : 0.05
      } else {
        // Evaluate candidate matching or semantic presence via token overlap
        const criterionText = entryToSearchText(qVal.criteria?.true)
        const combined = `${inst} ${criterionText}`
        const tokens = combined.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((t: string) => t.length > 3)
        const matches = tokens.filter((t: string) => stateText.includes(t))
        if (matches.length >= 2) {
          noul = 0.92
        } else if (matches.length === 1) {
          noul = 0.72
        } else {
          noul = 0.25
        }
      }

      const ans: JevNoulAnswer = {
        type: 'noul',
        noul,
      }
      answers[qKey] = ans
    } else if (qVal.type === 'score') {
      const ans: JevScoreAnswer = {
        type: 'score',
        score: 0,
        legend: {},
        probabilities: { '0': 0.5 },
        confidence: 0.5,
      }
      answers[qKey] = ans
    }
  }

  const durationMs = Date.now() - startedAt

  return {
    tier: 'deterministic_rule_engine',
    model: 'ae-deterministic-rule-v1',
    answers,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostAud: 'A$0.000000',
    },
    durationMs,
    attemptedTiers: ['deterministic_rule_engine'],
  }
}
