import { InteractiveAuthorityError } from '../../../interactiveAuthority'

const WORKSPACE_SECURITY_ERROR_CODES = [
  'identity_invalid',
  'principal_kind_invalid',
  'account_access_missing',
  'account_missing',
  'account_inactive',
  'ownership_mismatch',
  'policy_revision_conflict',
  'correlation_ref_invalid',
  'mfa_required',
  'step_up_required',
] as const

type WorkspaceSecurityErrorCode = (typeof WORKSPACE_SECURITY_ERROR_CODES)[number]

export class WorkspaceSecurityError extends InteractiveAuthorityError {
  constructor(code: WorkspaceSecurityErrorCode) {
    super(code)
  }
}
