import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  HarnessApprovalModeValues,
  resolveHarnessApprovalPolicy,
  runHarnessTool,
  type HarnessApprovalMode,
  type HarnessToolDefinition,
} from '@/modules/harness/public'

describe('AE harness approval policy', () => {
  it('auto-allows read tools across AE approval modes', () => {
    for (const mode of HarnessApprovalModeValues) {
      expect(resolveHarnessApprovalPolicy({
        tool: readTool(),
        mode,
        surface: 'answerThread',
      })).toMatchObject({
        policy: 'allow',
        status: 'allowed',
        reason: 'read_tool_auto_allowed',
        mode,
      })
    }
  })

  it('denies exec tools in every AE approval mode', () => {
    for (const mode of HarnessApprovalModeValues) {
      expect(resolveHarnessApprovalPolicy({
        tool: execTool(),
        mode,
      })).toMatchObject({
        policy: 'deny',
        status: 'refused',
        reason: 'exec_tools_not_supported',
      })
    }
  })

  it('collapses public prompt decisions to blocked outcomes', async () => {
    const promptedRead = readTool({ approval: 'prompt' })

    expect(resolveHarnessApprovalPolicy({
      tool: promptedRead,
      mode: 'public-read',
      surface: 'answerThread',
    })).toMatchObject({
      policy: 'prompt',
      status: 'blocked',
      promptAllowed: false,
      reason: 'public_prompt_not_allowed',
    })

    const outcome = await runHarnessTool({
      tool: promptedRead,
      input: {},
      surface: 'answerThread',
      toolCallId: 'tc-public-prompt',
    })

    expect(outcome.result).toMatchObject({
      status: 'blocked',
      errorCode: 'public_prompt_not_allowed',
    })
  })

  it('blocks writes that do not declare an AE source-write admission scope', () => {
    expect(resolveHarnessApprovalPolicy({
      tool: writeTool({ id: 'catalog.publish' }),
      mode: 'public-qualified-write',
      surface: 'answerThread',
      context: sourceWriteContext(),
    })).toMatchObject({
      policy: 'prompt',
      status: 'blocked',
      promptAllowed: false,
      reason: 'write_source_admission_not_declared',
    })
  })

  it('blocks inquiry source-write actions until request admission context is present', () => {
    expect(resolveHarnessApprovalPolicy({
      tool: inquirySubmitTool(),
      mode: 'public-qualified-write',
      surface: 'answerThread',
    })).toMatchObject({
      policy: 'prompt',
      status: 'blocked',
      promptAllowed: false,
      sourceWriteScope: 'public_inquiry',
      reason: 'write_requires_source_admission',
    })
  })

  it('refuses the removed public-qualified-write mode', () => {
    const results = Object.fromEntries(
      HarnessApprovalModeValues.map((mode) => [
        mode,
        resolveHarnessApprovalPolicy({
          tool: inquirySubmitTool(),
          mode,
          surface: 'answerThread',
          context: sourceWriteContext(),
        }),
      ]),
    ) as Record<HarnessApprovalMode, ReturnType<typeof resolveHarnessApprovalPolicy>>

    expect(results['public-qualified-write']).toMatchObject({
      policy: 'prompt',
      status: 'blocked',
      sourceWriteScope: 'public_inquiry',
      reason: 'agent_tool_admission_required',
    })

    for (const mode of HarnessApprovalModeValues.filter((mode) => mode !== 'public-qualified-write')) {
      expect(results[mode]).toMatchObject({
        policy: 'prompt',
        status: 'blocked',
        sourceWriteScope: 'public_inquiry',
        reason: 'source_write_mode_not_allowed',
      })
    }
  })

  it('keeps deny overrides authoritative without widening product boundaries', () => {
    expect(resolveHarnessApprovalPolicy({
      tool: readTool(),
      mode: 'public-read',
      surface: 'answerThread',
      overrides: { 'registry.search': 'deny' },
    })).toMatchObject({
      policy: 'deny',
      status: 'refused',
      override: true,
      reason: 'approval_override_denied',
    })

    expect(resolveHarnessApprovalPolicy({
      tool: execTool(),
      mode: 'internal-break-glass',
      overrides: { 'internal.exec': 'allow' },
    })).toMatchObject({
      policy: 'deny',
      status: 'refused',
      override: false,
      reason: 'exec_tools_not_supported',
    })
  })
})

function readTool(
  overrides: Partial<HarnessToolDefinition> = {},
): HarnessToolDefinition {
  return tool({
    id: 'registry.search',
    tier: 'read',
    surfaces: ['answerThread'],
    ...overrides,
  })
}

function inquirySubmitTool(): HarnessToolDefinition {
  return writeTool({
    id: 'inquiry.submit',
    surfaces: ['answerThread'],
  })
}

function execTool(): HarnessToolDefinition {
  return tool({
    id: 'internal.exec',
    tier: 'exec',
    surfaces: ['answerThread'],
  })
}

function writeTool(
  overrides: Partial<HarnessToolDefinition> = {},
): HarnessToolDefinition {
  return tool({
    id: 'inquiry.submit',
    tier: 'write',
    surfaces: ['answerThread'],
    ...overrides,
  })
}

function tool(
  overrides: Partial<HarnessToolDefinition> & Pick<HarnessToolDefinition, 'id' | 'tier'>,
): HarnessToolDefinition {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    summary: overrides.summary ?? 'Test harness tool.',
    boundaries: overrides.boundaries ?? ['Test boundary.'],
    tier: overrides.tier,
    surfaces: overrides.surfaces ?? ['answerThread'],
    inputSchema: overrides.inputSchema ?? z.object({}),
    outputSchema: overrides.outputSchema ?? z.object({ kind: z.literal('ok') }),
    ...(overrides.approval === undefined ? {} : { approval: overrides.approval }),
    run: overrides.run ?? (async () => ({ kind: 'ok' })),
    ...(overrides.summarizeOutput === undefined ? {} : { summarizeOutput: overrides.summarizeOutput }),
  }
}

function sourceWriteContext() {
  return {
    sourceWriteRequest: {
      method: 'POST',
      origin: 'https://ae.example',
      pathname: '/v1/route',
      bodyDigest: 'none',
    },
    agentToolAdmission: {
      toolId: 'inquiry.submit',
      scope: 'public_inquiry' as const,
      principalId: 'agent:test-principal',
    },
  }
}
