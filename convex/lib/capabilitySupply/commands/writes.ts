import { registerCapabilityTransportBinding as registerCapabilityTransportBindingWrite, registerCapabilityOffering as registerCapabilityOfferingWrite, setCapabilitySupplyEligibility as setCapabilitySupplyEligibilityWrite, registerCapabilityBindingCommand as runRegisterBindingCommand, registerCapabilityOfferingCommand as runRegisterOfferingCommand, quarantineCapabilityBindingCommand as runQuarantineCommand, setCapabilitySupplyEligibilityCommand as runSetEligibilityCommand, type EligibilityInput, type OperationLedgerPorts, type RegistrationContext, type SupplyCommandActor } from '@/modules/capability-supply/public'
import { capabilitySupplyToolPorts } from '../../../capabilitySupplyToolPorts'
import { capabilitySupplyWriterPorts } from '../../../capabilitySupplyWriterPorts'
import type { MutationCtx } from '../../../_generated/server'

export async function registerCapabilityOffering(
  db: MutationCtx['db'],
  input: unknown,
  registeredAt: number,
) {
  return registerCapabilityOfferingWrite(
    capabilitySupplyWriterPorts(db),
    input,
    registeredAt,
  )
}

export async function registerCapabilityTransportBinding(
  db: MutationCtx['db'],
  input: unknown,
  registeredAt: number,
  expectedToolRef?: string,
) {
  return registerCapabilityTransportBindingWrite(
    capabilitySupplyWriterPorts(db),
    input,
    registeredAt,
    expectedToolRef,
  )
}

export async function setCapabilitySupplyEligibility(
  db: MutationCtx['db'],
  input: EligibilityInput,
  updatedAt: number,
) {
  return setCapabilitySupplyEligibilityWrite(
    capabilitySupplyWriterPorts(db),
    input,
    updatedAt,
  )
}

function portsFor(db: MutationCtx['db']): OperationLedgerPorts {
  return capabilitySupplyToolPorts(db, {
    registerOffering: (registration, now) =>
      registerCapabilityOffering(db, registration, now),
    registerBinding: (registration, now, expectedToolRef) =>
      registerCapabilityTransportBinding(
        db,
        registration,
        now,
        expectedToolRef,
      ),
    setEligibility: (eligibility, now) =>
      setCapabilitySupplyEligibility(db, eligibility, now),
  })
}

export async function registerCapabilityOfferingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    registration: unknown
    context: RegistrationContext
  }>,
  now: number,
) {
  return runRegisterOfferingCommand(portsFor(db), command, now)
}

export async function registerCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    registration: unknown
    context: RegistrationContext
  }>,
  now: number,
) {
  return runRegisterBindingCommand(portsFor(db), command, now)
}

export async function setCapabilitySupplyEligibilityCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    eligibility: EligibilityInput
    context: RegistrationContext
  }>,
  now: number,
) {
  return runSetEligibilityCommand(portsFor(db), command, now)
}

export async function quarantineCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  now: number,
) {
  return runQuarantineCommand(portsFor(db), command, now)
}
