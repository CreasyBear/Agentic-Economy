/** Narrows a startTurn result for tests that expect the Turn to start (not a fenced thread). */
export function startedTurn<T>(result: T): Exclude<T, { kind: 'not_started' }> {
  if (typeof result === 'object' && result !== null && 'kind' in result) throw new Error('turn_not_started')
  return result as Exclude<T, { kind: 'not_started' }>
}
