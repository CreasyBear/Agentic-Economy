import { parseProviderOutput } from './parse-provider-output.mjs'

/**
 * Assertion for catalog-backed answer-turn eval cases.
 *
 * The provider runs the real `/api/answer/turn` handler against the deterministic
 * registry fixture and returns structured diagnostics. The case catalog owns the
 * expected slugs, evidence, timing, and copy checks; this assertion focuses on
 * making promptfoo failures readable.
 */
export default function assertAnswerTurn(output, context) {
  const parsedOutput = parseProviderOutput(output)
  if (parsedOutput.error) return parsedOutput.error
  const parsed = parsedOutput.value

  const expectPass = context.vars.expectPass === undefined ? true : context.vars.expectPass === 'true'
  const pass = parsed.ok === expectPass
  if (pass) {
    return { pass: true, score: 1, reason: 'Answer-turn expectations met' }
  }

  const problems = Array.isArray(parsed.problems) ? parsed.problems.join('; ') : 'no problem list'
  const slugs = Array.isArray(parsed.slugs) ? parsed.slugs.join(', ') : ''
  const toolQueries = Array.isArray(parsed.toolQueries) ? parsed.toolQueries.join(' | ') : ''
  const timings = Array.isArray(parsed.timingNames) ? parsed.timingNames.join(', ') : ''

  return {
    pass: false,
    score: 0,
    reason: [
      `Expected ok=${expectPass}, got ok=${String(parsed.ok)}`,
      `case=${String(parsed.caseId ?? context.vars.caseId ?? '')}`,
      `status=${String(parsed.status ?? '')}`,
      `problems=${problems}`,
      `slugs=[${slugs}]`,
      `toolQueries=[${toolQueries}]`,
      `timings=[${timings}]`,
    ].join(' | '),
  }
}
