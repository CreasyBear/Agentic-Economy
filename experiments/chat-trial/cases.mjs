export const cases = [
  { id: 'research-answer', mode: 'active', query: 'Research battery storage and return a sourced table.', expected: 'completed', dispatches: 1 },
  { id: 'discover-only', mode: 'active', query: 'Find a Tool for battery storage research.', expected: 'discovery', dispatches: 0 },
  { id: 'audit-result', mode: 'active', query: 'Audit https://example.com', expected: 'completed', dispatches: 1 },
  { id: 'clarification', mode: 'active', query: 'Audit my page.', reply: 'Audit https://example.com', expected: 'completed', dispatches: 1 },
  { id: 'guest-sign-in', mode: 'guest', query: 'Audit https://example.com', resume: true, expected: 'completed', dispatches: 1 },
  { id: 'expired-authority', mode: 'expired', query: 'Audit https://example.com', resume: true, expected: 'completed', dispatches: 1 },
  { id: 'funding-return', mode: 'unfunded', query: 'Audit https://example.com', resume: true, expected: 'completed', dispatches: 1 },
  { id: 'explicit-approval', mode: 'approval', query: 'Audit https://example.com', resume: true, expected: 'completed', dispatches: 1 },
  { id: 'pending-observation', mode: 'pending', query: 'Audit https://example.com', expected: 'completed', dispatches: 1 },
  { id: 'uncertain-observation', mode: 'uncertain', query: 'Audit https://example.com', expected: 'completed', dispatches: 1 },
  { id: 'no-supply', mode: 'empty', query: 'Research battery storage.', expected: 'discovery', dispatches: 0 },
  { id: 'changed-quote', mode: 'changed', query: 'Audit https://example.com', expected: 'blocked', dispatches: 0 },
  { id: 'held-pending', mode: 'held_pending', query: 'Audit https://example.com', complete: true, expected: 'completed', dispatches: 1 },
  { id: 'held-uncertain', mode: 'held_uncertain', query: 'Audit https://example.com', complete: true, expected: 'completed', dispatches: 1 },
  { id: 'denied-approval', mode: 'approval', query: 'Audit https://example.com', deny: true, expected: 'blocked', dispatches: 0 },
  { id: 'research-then-audit', mode: 'active', query: 'Research battery storage and return a sourced table.', followup: 'Audit https://example.com', expected: 'completed', dispatches: 2 },
  { id: 'model-error-before-action', mode: 'active', query: '__simulate_model_failure__', retryQuery: 'Audit https://example.com', expected: 'completed', dispatches: 1 },
  { id: 'denial-then-funded-request', mode: 'unfunded', query: 'Audit https://example.com', denyThenFund: true, expected: 'completed', dispatches: 1 },
]

export async function fixture(path, input) {
  const response = await fetch(`http://127.0.0.1:5142${path}`, {
    ...(input === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
    signal: AbortSignal.timeout(10_000),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(JSON.stringify(data))
  return data
}
