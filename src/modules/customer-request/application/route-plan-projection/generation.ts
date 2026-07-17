/**
 * Accept Convex Infer generations/aggregates — branded fields are validated at commit.
 */
export function storedGenerationRepresentsAggregate(
  generation: Readonly<{
    decisionSnapshot?: Readonly<{
      requestSnapshotDigest: string
      factsDigest: string
      evaluationDigest: string
      planRevisionId: string
      planDigest: string
    }>
    createdAt: number
    registrySnapshotDigest: string
    compiler: Readonly<{
      compilerVersion: string
      interpreterId: string
      proposalDigest: string
    }>
  }>,
  aggregate: Readonly<{
    snapshot: Readonly<{ snapshotDigest: string }>
    evaluation: Readonly<{ factsDigest: string; evaluationDigest: string }>
    plan: Readonly<{
      planRevisionId: string
      planDigest: string
      createdAt: number
      registrySnapshotDigest: string
      compilerVersion: string
      interpreterId: string
      proposalDigest: string
    }>
  }>,
): boolean {
  if (generation.decisionSnapshot !== undefined) {
    return generation.decisionSnapshot.requestSnapshotDigest === aggregate.snapshot.snapshotDigest
      && generation.decisionSnapshot.factsDigest === aggregate.evaluation.factsDigest
      && generation.decisionSnapshot.evaluationDigest === aggregate.evaluation.evaluationDigest
      && generation.decisionSnapshot.planRevisionId === aggregate.plan.planRevisionId
      && generation.decisionSnapshot.planDigest === aggregate.plan.planDigest
  }
  // Historical generations predate decision snapshots. They were atomically
  // validated against this immutable plan at commit, so exact compiler lineage
  // and creation time identify the only aggregate they can safely prepare.
  return generation.createdAt === aggregate.plan.createdAt
    && generation.registrySnapshotDigest === aggregate.plan.registrySnapshotDigest
    && generation.compiler.compilerVersion === aggregate.plan.compilerVersion
    && generation.compiler.interpreterId === aggregate.plan.interpreterId
    && generation.compiler.proposalDigest === aggregate.plan.proposalDigest
}
