import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { degrade } from '@/lib/observability/degrade'
import type { AdminShellReadback } from '@/modules/security/public'

const readAdminIndexHealthQuery = sourceQuery<Record<string, never>, AdminShellReadback>(
  'security:readAdminIndexHealth'
)


export async function readAdminIndexHealthThroughSource(): Promise<AdminShellReadback> {
  try {
    return await callSourceQuery(readAdminIndexHealthQuery, {})
  } catch (cause) {
    return degrade(cause, {
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      surface: 'index_health',
      generatedAt: Date.now(),
      publicMessage: 'Admin readback requires active source-owned membership.',
      rows: [],
    }, {
      site: 'readAdminIndexHealthThroughSource',
      reason: 'source_unavailable',
    })
  }
}

