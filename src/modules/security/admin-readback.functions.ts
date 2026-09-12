import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { degrade } from '@/lib/observability/degrade'
import type {
  AdminReadbackSurface,
  AdminShellReadback,
} from '@/modules/security/public'

const readAdminAuditEventsQuery = sourceQuery<Record<string, never>, AdminShellReadback>(
  'security:readAdminAuditEvents'
)
const readAdminIndexHealthQuery = sourceQuery<Record<string, never>, AdminShellReadback>(
  'security:readAdminIndexHealth'
)

export async function readAdminAuditEventsThroughSource(): Promise<AdminShellReadback> {
  try {
    return await callSourceQuery(readAdminAuditEventsQuery, {})
  } catch (cause) {
    return degrade(cause, deniedAdminReadback('audit_events'), {
      site: 'readAdminAuditEventsThroughSource',
      reason: 'source_unavailable',
    })
  }
}

export async function readAdminIndexHealthThroughSource(): Promise<AdminShellReadback> {
  try {
    return await callSourceQuery(readAdminIndexHealthQuery, {})
  } catch (cause) {
    return degrade(cause, deniedAdminReadback('index_health'), {
      site: 'readAdminIndexHealthThroughSource',
      reason: 'source_unavailable',
    })
  }
}

function deniedAdminReadback(surface: AdminReadbackSurface): AdminShellReadback {
  return {
    kind: 'denied',
    httpStatus: 401,
    reason: 'missing_membership',
    surface,
    generatedAt: Date.now(),
    publicMessage: 'Admin readback requires active source-owned membership.',
    rows: [],
  }
}
