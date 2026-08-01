type ThreadOwner = Readonly<{
  threadId: string
  pseudonymousSessionId: string
}>

export function assertDecisionMapThreadOwner(
  threadId: string | undefined,
  sessionId: string,
  thread: ThreadOwner | null,
): void {
  if (threadId === undefined || thread?.threadId !== threadId || thread.pseudonymousSessionId !== sessionId) {
    throw new Error('thread_forbidden')
  }
}
