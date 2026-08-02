export function parseProviderOutput(output) {
  try {
    return { value: JSON.parse(String(output)) }
  } catch {
    return {
      error: { pass: false, score: 0, reason: 'Provider output was not JSON' },
    }
  }
}
