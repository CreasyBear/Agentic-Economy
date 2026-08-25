import { z } from 'zod'

const storedProjectQuerySchema = z.object({
  project: z.string().max(200).optional().catch(undefined),
})

/**
 * Preserves old shared URL round-trips only. The opaque value is never loaded,
 * resolved, or treated as project/WorkTree authority.
 */
export function readStoredProjectQueryCompatibility(
  search: Record<string, unknown>,
): { project?: string } {
  const project = storedProjectQuerySchema.parse(search).project?.trim() ?? ''
  return project.length === 0 ? {} : { project }
}
