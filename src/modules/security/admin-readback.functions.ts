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

export function readAdminAuditEventsThroughSource(): Promise<AdminShellReadback> {
  return readAdminSurfaceThroughSource('audit_events')
}

export function readAdminIndexHealthThroughSource(): Promise<AdminShellReadback> {
  return readAdminSurfaceThroughSource('index_health')
}

async function readAdminSurfaceThroughSource(surface: AdminReadbackSurface): Promise<AdminShellReadback> {
  try {
    switch (surface) {
      case 'audit_events':
        return await callSourceQuery(readAdminAuditEventsQuery, {})
      case 'index_health':
        return await callSourceQuery(readAdminIndexHealthQuery, {})
    }
  } catch {
    return deniedAdminReadback(surface)
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
