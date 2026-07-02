/**
 * Assertion for multi-turn answer-thread eval cases.
 *
 * The provider returns a compact thread result plus per-turn diagnostics. Keep
 * failures readable enough that a single promptfoo row can point at the broken
 * turn, evidence shape, or timing budget.
 */
export default function assertAnswerThread(output, context) {
  let parsed
  try {
    parsed = JSON.parse(String(output))
  } catch {
    return { pass: false, score: 0, reason: 'Provider output was not JSON' }
  }

  const expectPass = context.vars.expectPass === undefined ? true : context.vars.expectPass === 'true'
  const pass = parsed.ok === expectPass
  if (pass) {
    return { pass: true, score: 1, reason: 'Answer-thread expectations met' }
  }

  const threadProblems = Array.isArray(parsed.problems) ? parsed.problems.join('; ') : 'no problem list'
  const turnDetails = Array.isArray(parsed.turns)
    ? parsed.turns.map((turn, index) => {
        const problems = Array.isArray(turn.problems) ? turn.problems.join('; ') : ''
        const slugs = Array.isArray(turn.slugs) ? turn.slugs.join(', ') : ''
        const toolQueries = Array.isArray(turn.toolQueries) ? turn.toolQueries.join(' | ') : ''
        return `turn ${index + 1}: status=${String(turn.status ?? '')} slugs=[${slugs}] toolQueries=[${toolQueries}] problems=${problems}`
      }).join(' || ')
    : 'no turn details'

  return {
    pass: false,
    score: 0,
    reason: [
      `Expected ok=${expectPass}, got ok=${String(parsed.ok)}`,
      `case=${String(parsed.caseId ?? context.vars.caseId ?? '')}`,
      `problems=${threadProblems}`,
      turnDetails,
    ].join(' | '),
  }
}
