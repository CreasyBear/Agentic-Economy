import type { ActionContext, ActionSurface } from '@/modules/common/action'
import type { SourceWriteAdmissionScope } from '@/modules/security/source-write-admission'
import { isRecord } from '@/modules/common/is-record'

import type {
  HarnessApprovalDecision,
  HarnessApprovalPolicy,
  HarnessToolDefinition,
} from './harness.schema'

export type HarnessApprovalMode =
  | 'public-read'
  | 'public-qualified-write'
  | 'owner-ui'
  | 'admin-explicit'
  | 'internal-break-glass'

export const HarnessApprovalModeValues = [
  'public-read',
  'public-qualified-write',
  'owner-ui',
  'admin-explicit',
  'internal-break-glass',
] as const satisfies readonly HarnessApprovalMode[]

export type HarnessApprovalResolutionStatus = 'allowed' | 'blocked' | 'refused'

export type HarnessApprovalOverrideMap = Readonly<Record<string, unknown>>

export type HarnessSourceWriteAdmissionDeclaration = {
  scope: SourceWriteAdmissionScope
  allowedModes: readonly HarnessApprovalMode[]
  authority?: 'owner' | 'admin'
}

export type HarnessApprovalTool = HarnessToolDefinition & {
  sourceWriteAdmission?: HarnessSourceWriteAdmissionDeclaration
}

export type ResolveHarnessApprovalPolicyInput = {
  tool: HarnessApprovalTool
  mode: HarnessApprovalMode
  context?: ActionContext
  surface?: ActionSurface
  overrides?: HarnessApprovalOverrideMap
}

export type HarnessApprovalResolution = HarnessApprovalDecision & {
  mode: HarnessApprovalMode
  status: HarnessApprovalResolutionStatus
  override: boolean
  promptAllowed: boolean
  sourceWriteScope?: SourceWriteAdmissionScope
}

const PUBLIC_MODES: ReadonlySet<HarnessApprovalMode> = new Set([
  'public-read',
  'public-qualified-write',
])

const BUILTIN_SOURCE_WRITE_DECLARATIONS: Readonly<Record<string, HarnessSourceWriteAdmissionDeclaration>> = {
  'inquiry.submit': {
    scope: 'public_inquiry',
    allowedModes: ['public-qualified-write'],
  },
  'inquiry.reply': {
    scope: 'owner_inquiry',
    allowedModes: ['owner-ui'],
    authority: 'owner',
  },
  'inquiry.markRead': {
    scope: 'owner_inquiry',
    allowedModes: ['owner-ui'],
    authority: 'owner',
  },
  'inquiry.close': {
    scope: 'owner_inquiry',
    allowedModes: ['owner-ui'],
    authority: 'owner',
  },
}

const APPROVAL_VALUES: ReadonlySet<HarnessApprovalPolicy> = new Set([
  'allow',
  'deny',
  'prompt',
])

export function resolveHarnessApprovalPolicy(
  input: ResolveHarnessApprovalPolicyInput,
): HarnessApprovalResolution {
  const { tool, mode } = input
  const overridePolicy = overrideForTool(tool.id, input.overrides)

  if (overridePolicy === 'deny') {
    return refuse(input, 'approval_override_denied', true)
  }

  if (tool.approval === 'deny') {
    return refuse(input, 'tool_policy_denied', false)
  }

  if (input.surface !== undefined && !tool.surfaces.includes(input.surface)) {
    return refuse(input, 'surface_not_allowed', false)
  }

  if (tool.tier === 'exec') {
    return refuse(input, 'exec_tools_not_supported', false)
  }

  if (tool.approval === 'prompt' && tool.tier === 'read') {
    return prompt(input, publicReason(mode, 'tool_policy_prompt_required'), overridePolicy === 'prompt')
  }

  if (tool.tier === 'read') {
    if (overridePolicy === 'prompt') {
      return prompt(input, publicReason(mode, 'approval_override_prompt_required'), true)
    }
    return allow(input, 'read_tool_auto_allowed', overridePolicy === 'allow')
  }

  const declaration = sourceWriteDeclarationForTool(tool)
  if (declaration === undefined) {
    return block(input, 'write_source_admission_not_declared', overridePolicy === 'prompt')
  }

  if (!declaration.allowedModes.includes(mode)) {
    return block(input, 'source_write_mode_not_allowed', overridePolicy === 'prompt', declaration.scope)
  }

  if (input.context?.sourceWriteRequest === undefined) {
    return block(input, 'write_requires_source_admission', overridePolicy === 'prompt', declaration.scope)
  }

  if (mode === 'public-qualified-write') {
    return block(input, 'agent_tool_admission_required', overridePolicy === 'prompt', declaration.scope)
  }

  if (!hasRequiredAuthority(input.context, declaration.authority)) {
    return block(input, `${declaration.authority}_auth_required`, overridePolicy === 'prompt', declaration.scope)
  }

  if (mode === 'admin-explicit' && overridePolicy !== 'allow') {
    return prompt(input, 'admin_write_requires_explicit_approval', false, declaration.scope)
  }

  return allow(input, 'write_source_admitted', overridePolicy === 'allow', declaration.scope)
}

export function sourceWriteDeclarationForTool(
  tool: HarnessApprovalTool,
): HarnessSourceWriteAdmissionDeclaration | undefined {
  return tool.sourceWriteAdmission ?? BUILTIN_SOURCE_WRITE_DECLARATIONS[tool.id]
}

function overrideForTool(
  toolId: string,
  overrides: HarnessApprovalOverrideMap | undefined,
): HarnessApprovalPolicy | undefined {
  if (overrides === undefined || !Object.hasOwn(overrides, toolId)) {
    return undefined
  }

  const value = overrides[toolId]
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  return APPROVAL_VALUES.has(normalized as HarnessApprovalPolicy)
    ? normalized as HarnessApprovalPolicy
    : undefined
}

function allow(
  input: ResolveHarnessApprovalPolicyInput,
  reason: string,
  override: boolean,
  sourceWriteScope?: SourceWriteAdmissionScope,
): HarnessApprovalResolution {
  return decision(input, {
    policy: 'allow',
    reason,
    status: 'allowed',
    override,
    ...(sourceWriteScope === undefined ? {} : { sourceWriteScope }),
  })
}

function block(
  input: ResolveHarnessApprovalPolicyInput,
  reason: string,
  override: boolean,
  sourceWriteScope?: SourceWriteAdmissionScope,
): HarnessApprovalResolution {
  return decision(input, {
    policy: 'prompt',
    reason,
    status: 'blocked',
    override,
    ...(sourceWriteScope === undefined ? {} : { sourceWriteScope }),
  })
}

function prompt(
  input: ResolveHarnessApprovalPolicyInput,
  reason: string,
  override: boolean,
  sourceWriteScope?: SourceWriteAdmissionScope,
): HarnessApprovalResolution {
  return decision(input, {
    policy: 'prompt',
    reason,
    status: 'blocked',
    override,
    ...(sourceWriteScope === undefined ? {} : { sourceWriteScope }),
  })
}

function refuse(
  input: ResolveHarnessApprovalPolicyInput,
  reason: string,
  override: boolean,
): HarnessApprovalResolution {
  return decision(input, {
    policy: 'deny',
    reason,
    status: 'refused',
    override,
  })
}

function decision(
  input: ResolveHarnessApprovalPolicyInput,
  resolved: {
    policy: HarnessApprovalPolicy
    reason: string
    status: HarnessApprovalResolutionStatus
    override: boolean
    sourceWriteScope?: SourceWriteAdmissionScope
  },
): HarnessApprovalResolution {
  return {
    policy: resolved.policy,
    reason: resolved.reason,
    tier: input.tool.tier,
    mode: input.mode,
    status: resolved.status,
    override: resolved.override,
    promptAllowed: resolved.policy === 'prompt' && !PUBLIC_MODES.has(input.mode),
    ...(resolved.sourceWriteScope === undefined ? {} : { sourceWriteScope: resolved.sourceWriteScope }),
  }
}

function publicReason(mode: HarnessApprovalMode, reason: string): string {
  return PUBLIC_MODES.has(mode) ? 'public_prompt_not_allowed' : reason
}

function hasRequiredAuthority(
  context: ActionContext | undefined,
  authority: HarnessSourceWriteAdmissionDeclaration['authority'],
): boolean {
  if (authority === undefined) {
    return true
  }

  if (!isRecord(context)) {
    return false
  }

  const approval = context.harnessApproval
  if (!isRecord(approval)) {
    return false
  }

  return approval.authority === authority
}

