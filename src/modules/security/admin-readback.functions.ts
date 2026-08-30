import { callSourceQuery, sourceQuery } from '@/lib/server/convex-source'
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
  } catch {
    return deniedAdminReadback('audit_events')
  }
}

export async function readAdminIndexHealthThroughSource(): Promise<AdminShellReadback> {
  try {
    return await callSourceQuery(readAdminIndexHealthQuery, {})
  } catch {
    return deniedAdminReadback('index_health')
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
