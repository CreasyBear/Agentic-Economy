import { afterEach, describe, expect, it, vi } from 'vitest'

import { runFundCommand } from '../../../tools/ae/commands/fund'
import { runRevokeCommand } from '../../../tools/ae/commands/revoke'
import type { CliOptions } from '../../../tools/ae/lib/args'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

describe('owner browser CLI continuations', () => {
  it('fund emits one owner-browser continuation without reading or sending an agent credential', async () => {
    process.env.AE_API_KEY = 'agent-secret-sentinel'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()

    try {
      await runFundCommand([], options)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toEqual({
      kind: 'continuation',
      command: 'fund',
      surface: 'owner_browser',
      authentication: 'owner_session',
      method: 'open',
      path: '/agent-access',
      anchor: '#fund',
      url: 'https://market.example/agent-access#fund',
      agentCredential: 'not_used',
      instruction: 'Open this continuation as the owner to add assistant credit; the CLI does not fund an owner account.',
    })
    expect(output.read()).not.toContain('agent-secret-sentinel')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('revoke emits one owner-browser continuation without revoking through the agent gateway', async () => {
    process.env.AE_API_KEY = 'agent-secret-sentinel'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()

    try {
      await runRevokeCommand([], options)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'continuation',
      command: 'revoke',
      surface: 'owner_browser',
      authentication: 'owner_session',
      method: 'open',
      path: '/agent-access',
      anchor: '#revoke',
      url: 'https://market.example/agent-access#revoke',
      agentCredential: 'not_used',
    })
    expect(output.read()).not.toContain('agent-secret-sentinel')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
