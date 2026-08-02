export function sumToolDurationMs(
  call: { readonly toolId: string; readonly seq: number },
  timings: readonly {
    readonly durationMs: number
    readonly metadata?: Readonly<Record<string, unknown>>
  }[],
): number {
  let total = 0
  for (const timing of timings) {
    if (
      timing.metadata?.toolId === call.toolId &&
      (timing.metadata.toolSeq === undefined || timing.metadata.toolSeq === call.seq)
    ) {
      total += timing.durationMs
    }
  }
  return total
}
