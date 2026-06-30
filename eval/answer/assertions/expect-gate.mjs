export default function assertGate(output, context) {
  let parsed
  try {
    parsed = JSON.parse(String(output))
  } catch {
    return { pass: false, score: 0, reason: 'Provider output was not JSON' }
  }

  const expectPass = context.vars.expectPass === 'true'
  const pass = parsed.ok === expectPass
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Gate expectation met' : `Expected ok=${expectPass}, got ok=${parsed.ok}${parsed.code ? ` (${parsed.code})` : ''}`,
  }
}
