import { parseProviderOutput } from './parse-provider-output.mjs'

export default function assertEvalOk(output, context) {
  const parsedOutput = parseProviderOutput(output)
  if (parsedOutput.error) return parsedOutput.error
  const parsed = parsedOutput.value

  const expectPass = context.vars.expectPass === 'true'
  const pass = parsed.ok === expectPass
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Eval expectation met' : `Expected ok=${expectPass}, got ok=${parsed.ok}`,
  }
}
