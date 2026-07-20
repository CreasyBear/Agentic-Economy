import { pathToFileURL } from 'node:url'

import { verifyPacketIntegrity } from './paid-operation-hosted-proof-contract'

export * from './paid-operation-hosted-proof-contract'
export * from './paid-operation-hosted-live-collector'
export * from './paid-operation-hosted-journey'

async function main(): Promise<void> {
  if (process.argv.length !== 3
    || process.argv[2] !== '--verify-packet-integrity') {
    throw new Error('usage: --verify-packet-integrity')
  }
  const serialized = process.env.AE_PAID_OPERATION_HOSTED_PACKET_JSON
  if (serialized === undefined || serialized.trim() === '') {
    throw new Error('AE_PAID_OPERATION_HOSTED_PACKET_JSON is required')
  }

  let packet: unknown
  try {
    packet = JSON.parse(serialized)
  } catch {
    throw new Error('AE_PAID_OPERATION_HOSTED_PACKET_JSON must be valid JSON')
  }
  const result = verifyPacketIntegrity(packet)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.kind === 'refused') process.exitCode = 1
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined
  && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'verification failed'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
