import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { createServer } from 'node:http'

import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { vi } from 'vitest'

import {
  ANSWER_TURN_DATA_PART,
  type AnswerEvent,
  type AnswerTurnFrame,
  type AnswerTurnUIMessage,
} from '@/modules/answer/public'

const CLI_ARGV = ['--import', 'tsx', 'tools/ae/cli.ts'] as const

export function answerTurnResponse(frames: readonly AnswerTurnFrame[]): Response {
  const stream = createUIMessageStream<AnswerTurnUIMessage>({
    execute: ({ writer }) => {
      for (const frame of frames) {
        writer.write({ type: ANSWER_TURN_DATA_PART, data: frame, transient: true })
      }
    },
    onError: () => 'answer_turn_failed',
  })
  return createUIMessageStreamResponse({ stream })
}

export function rawAnswerEvent(type: string, fields: Record<string, unknown>): AnswerEvent {
  return { type, ...fields } as unknown as AnswerEvent
}

export function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return {
    read: () => writes.join(''),
    restore: () => spy.mockRestore(),
  }
}

export function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

export function validSupplyPublishInput(): Record<string, unknown> {
  return {
    version: 'supply-publication:v1',
    businessId: ' business:test ',
    offeringRef: ' offering:test ',
    offeringRevision: 1,
    offeringSourceHash: ' hash:test ',
    source: {},
    evidenceRefs: ['evidence:test'],
    idempotencyKey: ' idempotency-test ',
  }
}

export async function startAnswerServer(frames: readonly AnswerTurnFrame[]): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  const body = await answerTurnResponse(frames).text()
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    throw new Error('answer test server did not expose a TCP address')
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    }),
  }
}

export async function spawnCli(args: readonly string[]): Promise<{
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    status: number | null
    signal: NodeJS.Signals | null
    stdout: string
    stderr: string
  }>()
  const child = spawn(process.execPath, [...CLI_ARGV, ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  child.once('error', reject)
  child.once('close', (status, signal) => resolve({
    status,
    signal,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }))
  return promise
}

export function spawnCliSync(
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [...CLI_ARGV, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: options?.env,
  })
}
