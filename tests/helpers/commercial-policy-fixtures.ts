import {
  PACKAGE4_FORMANCE_REQUIREMENTS,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
  type CommercialPolicyControls,
} from '../../src/modules/money/public'

export const PRODUCTION_COMMERCIAL_POLICY_CONTROLS: CommercialPolicyControls = Object.freeze({
  ...SANDBOX_COMMERCIAL_POLICY_CONTROLS,
  treasury_custody: Object.freeze({
    ...SANDBOX_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
    formanceLedgerVersion: PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion,
    formanceGatewayVersion: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion,
    formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    maximumSdkIntegerUnits: PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits,
    architectureReviewCumulativeUnits:
      PACKAGE4_FORMANCE_REQUIREMENTS.architectureReviewCumulativeUnits,
    deploymentClass: 'real_money',
    postgresProtection: 'managed_pitr',
    recoveryPointObjectiveMinutes: 5,
    recoveryTimeObjectiveMinutes: 60,
  }),
  operations: Object.freeze({
    ...SANDBOX_COMMERCIAL_POLICY_CONTROLS.operations,
    formanceSdkVersion: PACKAGE4_FORMANCE_REQUIREMENTS.sdkVersion,
    formanceSdkArtifactDigest: PACKAGE4_FORMANCE_REQUIREMENTS.sdkArtifactDigest,
    backupControl: 'postgres_pitr',
    restoreControl: 'production_rehearsed',
    dailyCloseControl: 'human_signed',
  }),
})
