import type { MutationCtx } from '../../../_generated/server'

type WorkspaceProvisioningErrorCode =
  | 'creator_binding_missing'
  | 'creator_principal_inactive'
  | 'display_name_invalid'
  | 'clerk_org_id_invalid'
  | 'active_organization_mismatch'
  | 'identity_invalid'
  | 'authority_conflict'
  | 'correlation_ref_invalid'

export class WorkspaceProvisioningError extends Error {
  readonly code: WorkspaceProvisioningErrorCode

  constructor(code: WorkspaceProvisioningErrorCode) {
    super(code)
    this.name = 'WorkspaceProvisioningError'
    this.code = code
  }
}

export type ProvisionDb = Pick<MutationCtx, 'db'>
