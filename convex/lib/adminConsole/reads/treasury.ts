import type { QueryCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import type { AllowedAdminAuthority } from '@/lib/operator/admin-console/contracts'
import { canAdminRolePerformAction } from '@/modules/security/public'
import type { AdminTreasuryResult } from '@/modules/money/treasury-report'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { configuredTreasuryIdentity } from '../../money/treasury/progress'
import { readLatestTreasurySnapshot } from '../../money/treasury/health'
import { readTreasuryControlState } from '../actions/treasury'

/** Admin authority is resolved by the registration; this read never contacts money providers. */
export async function readAdminTreasury(ctx: QueryCtx & { admin: AllowedAdminAuthority }): Promise<AdminTreasuryResult> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return { kind: 'refused', code: 'deployment_environment_invalid' }
  const custody = configuredTreasuryIdentity() ?? null
  const [control, owners, observation, snapshot, alerts] = await Promise.all([
    readTreasuryControlState(ctx, environment),
    ctx.db.query('adminMemberships').withIndex('by_state_and_role', q => q.eq('state', 'active').eq('role', 'owner_admin')).take(2),
    custody === null ? null : ctx.db.query('moneyTreasuryObservations').withIndex('by_custody_and_observedAt', q => q
      .eq('environment', environment).eq('custodyRef', custody.custodyRef).eq('custodyGeneration', custody.custodyGeneration)).order('desc').first(),
    custody === null ? null : readLatestTreasurySnapshot(ctx, custody),
    custody === null ? [] : ctx.db.query('moneyTreasuryAlerts').withIndex('by_scope_and_state', q => q
      .eq('environment', environment).eq('custodyIdentityDigest', canonicalDigest(custody)).eq('state', 'open')).take(10),
  ])
  return { kind: 'ready', environment, custody,
    observation: observation === null ? null : { totalUnits: observation.totalUnits, observedAt: observation.observedAt, evidenceRef: observation.evidenceRef },
    controls: { paymentsOpenTo: control.launch.paymentsOpenTo, resumePaymentsOpenTo: control.launch.resumePaymentsOpenTo,
      launchStateDigest: control.launchStateDigest, thresholds: control.settings.thresholds, settingsStateDigest: control.settingsStateDigest,
      canManage: canAdminRolePerformAction(ctx.admin.membership.role, 'manage_commercial_policy'), resumeRequiresApproval: owners.length >= 2 },
    snapshot, alerts: alerts.map(({ alertRef, code, severity, evidenceRefs, firstSeenAt, lastSeenAt }) =>
      ({ alertRef, code, severity, evidenceRefs, firstSeenAt, lastSeenAt })),
  }
}
