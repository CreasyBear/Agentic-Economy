import { readFile, writeFile } from 'node:fs/promises'

import {
  resumeDevelopmentBookingObjective,
  runFullYoloDevelopmentBookingPhase,
} from '../../src/modules/booking/development-booking-objective'
import { projectDurableRun } from '../../src/modules/booking/development-booking-packet'
import { createDevelopmentBookingSigningCustody } from '../../src/modules/booking/development-booking-signing-custody'

type CustodyFile = Readonly<{ keyId: string; privateKey: string }>

const command = process.argv[2]
const inputPath = process.argv[3]
const outputPath = process.argv[4]
const custodyPath = process.argv[5]
if (command === undefined || outputPath === undefined || custodyPath === undefined) {
  throw new Error('full_yolo_process_worker_arguments_required')
}
const custody = createDevelopmentBookingSigningCustody(
  JSON.parse(await readFile(custodyPath, 'utf8')) as CustodyFile,
)

if (command === 'booking') {
  const phase = await runFullYoloDevelopmentBookingPhase(custody)
  await writeFile(outputPath, JSON.stringify(phase), { encoding: 'utf8', flag: 'wx' })
} else if (command === 'resume') {
  if (inputPath === undefined) throw new Error('full_yolo_process_worker_input_required')
  const phase = JSON.parse(await readFile(inputPath, 'utf8')) as any
  const resumed = await resumeDevelopmentBookingObjective({
    processRef: `pid:${process.pid}`,
    mandate: phase.mandate,
    mandateSnapshot: phase.midRun.mandateSnapshot,
    providerSnapshot: phase.midRun.providerSnapshot,
    objectiveState: phase.midRun.objectiveState,
    durableInvocations: phase.midRun.durableInvocations,
    signingCustody: custody,
  })
  if (resumed.cancellationRun === null || resumed.cancellationResult === null) {
    throw new Error('full_yolo_process_worker_cancellation_missing')
  }
  const cancellationRecord = {
    invocationRef: resumed.cancellationRun.view.invocationRef,
    action: resumed.cancellationRun.view.action,
    acceptedAuthority: resumed.cancellationRun.view.acceptedAuthority,
    events: resumed.cancellationRun.events,
    durable: projectDurableRun(resumed.cancellationRun),
    resultDigest: resumed.cancellationRun.source.resultIdentity?.resultDigest,
  }
  await writeFile(outputPath, JSON.stringify({
    kind: 'cancellation_resume_complete',
    processId: process.pid,
    mandate: phase.mandate,
    grant: phase.grant,
    initialObjectiveState: phase.initialObjectiveState,
    midRun: phase.midRun,
    policyDecisions: [...phase.policyDecisions, ...resumed.newPolicyDecisions],
    invocationRecords: [...phase.invocationRecords, cancellationRecord],
    mandateSnapshot: resumed.store.exportSnapshot(),
    providerSnapshot: resumed.providerSnapshot,
    objectiveState: resumed.objectiveState,
    effectCounts: resumed.effectCounts,
    reconstructedInvocationRefs: resumed.reconstructed.map(({ invocationRef }) => invocationRef),
    providerAEffects: phase.providerAEffects,
  }), { encoding: 'utf8', flag: 'wx' })
} else if (command === 'replay') {
  if (inputPath === undefined) throw new Error('full_yolo_process_worker_input_required')
  const phase = JSON.parse(await readFile(inputPath, 'utf8')) as any
  const replayed = await resumeDevelopmentBookingObjective({
    processRef: `pid:${process.pid}`,
    mandate: phase.mandate,
    mandateSnapshot: phase.mandateSnapshot,
    providerSnapshot: phase.providerSnapshot,
    objectiveState: phase.objectiveState,
    durableInvocations: phase.invocationRecords.map(({ durable }: any) => durable),
    signingCustody: custody,
  })
  await writeFile(outputPath, JSON.stringify({
    kind: 'terminal_replay_complete',
    processId: process.pid,
    objectiveState: replayed.objectiveState,
    effectCounts: replayed.effectCounts,
    reconstructedInvocationRefs: replayed.reconstructed.map(({ invocationRef }) => invocationRef),
  }), { encoding: 'utf8', flag: 'wx' })
} else {
  throw new Error('full_yolo_process_worker_command_invalid')
}
