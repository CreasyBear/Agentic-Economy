import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'

const packet = buildDevelopmentPublishedOperationEvidence()
verifyDevelopmentPublishedOperationEvidence(packet)
process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`)
