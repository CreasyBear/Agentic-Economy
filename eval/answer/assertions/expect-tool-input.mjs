/**
 * Assertion for the tool-use agent eval mode.
 *
 * Proves the answer agent persisted the tool input it chose (e.g. a corrected
 * `registry.search("parramatta")` for a misspelled "paramata"), grounded the
 * prose against the resulting slugs, and that the gate verdict matches the
 * expected pass/fail. The provider runs the real `runAnswerToolUseAgent` with a
 * deterministic test-seam generator, so this is CI-runnable without an
 * OpenRouter key.
 */
export default function assertToolInput(output, context) {
  let parsed
  try {
    parsed = JSON.parse(String(output))
  } catch {
    return { pass: false, score: 0, reason: 'Provider output was not JSON' }
  }

  const expectPass = context.vars.expectPass === 'true'
  const expectedSlug = typeof context.vars.expectedSlug === 'string' ? context.vars.expectedSlug : ''
  const expectedToolInput = context.vars.plannedInput ?? ''

  if (typeof parsed.gateOk !== 'boolean') {
    return { pass: false, score: 0, reason: `Missing gateOk in provider output: ${String(output)}` }
  }

  if (parsed.gateOk !== expectPass) {
    return {
      pass: false,
      score: 0,
      reason: `Expected gate ok=${expectPass}, got ok=${parsed.gateOk}${parsed.detail ? ` (${parsed.detail})` : ''}`,
    }
  }

  if (!parsed.ok) {
    return {
      pass: false,
      score: 0,
      reason: `Evaluator reported not ok: ${parsed.detail ?? 'no detail'}`,
    }
  }

  // The agent must have persisted a tool call with the chosen input.
  let chosenInput = null
  try {
    chosenInput = JSON.parse(String(parsed.toolInput ?? '{}'))
  } catch {
    return { pass: false, score: 0, reason: `Tool input was not JSON: ${parsed.toolInput}` }
  }

  let expectedInput = null
  try {
    expectedInput = JSON.parse(String(expectedToolInput))
  } catch {
    return { pass: false, score: 0, reason: `Expected tool input was not JSON: ${expectedToolInput}` }
  }

  if (chosenInput.query !== expectedInput.query) {
    return {
      pass: false,
      score: 0,
      reason: `Expected tool input query="${expectedInput.query}", got "${chosenInput.query ?? ''}"`,
    }
  }

  if (expectedSlug.length > 0) {
    const slugs = String(parsed.slug ?? '').split(',').filter((value) => value.length > 0)
    if (!slugs.includes(expectedSlug)) {
      return {
        pass: false,
        score: 0,
        reason: `Expected slug "${expectedSlug}" not in tool-result slugs [${slugs.join(', ')}]`,
      }
    }
  }

  return { pass: true, score: 1, reason: 'Tool-use agent chose the expected input and grounded the prose' }
}
