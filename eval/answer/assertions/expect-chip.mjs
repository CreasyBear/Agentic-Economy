export default function assertChip(output, context) {
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
    reason: pass ? 'Chip expectation met' : `Expected ok=${expectPass}, got ok=${parsed.ok}`,
  }
}
