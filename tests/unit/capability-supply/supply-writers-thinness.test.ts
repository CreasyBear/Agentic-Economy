import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const writerPorts = readFileSync('convex/capabilitySupplyWriterPorts.ts', 'utf8')
const moduleRoots = {
  offering: 'src/modules/capability-supply/internal/offering',
  binding: 'src/modules/capability-supply/internal/binding',
  eligibility: 'src/modules/capability-supply/internal/eligibility',
} as const

describe('capability-supply supply-writers thinness', () => {
  it('does not keep offering/binding/eligibility writer bodies in the Convex host', () => {
    const offeringStart = convexHost.indexOf('export async function registerCapabilityOffering(')
    const bindingStart = convexHost.indexOf('export async function registerCapabilityTransportBinding(')
    const eligibilityStart = convexHost.indexOf('export async function setCapabilitySupplyEligibility(')
    expect(offeringStart).toBeGreaterThanOrEqual(0)
    expect(bindingStart).toBeGreaterThanOrEqual(0)
    expect(eligibilityStart).toBeGreaterThanOrEqual(0)

    const offeringBody = convexHost.slice(offeringStart, offeringStart + 400)
    const bindingBody = convexHost.slice(bindingStart, bindingStart + 400)
    const eligibilityBody = convexHost.slice(eligibilityStart, eligibilityStart + 400)

    expect(offeringBody).toContain('registerCapabilityOfferingWrite')
    expect(offeringBody).toContain('capabilitySupplyWriterPorts')
    expect(offeringBody).not.toContain('defineCapabilityOfferingRegistration')
    expect(offeringBody).not.toContain('capabilityOfferingRegistrationHash')
    expect(offeringBody).not.toContain('db.insert(')
    expect(offeringBody).not.toContain('offering_identity_conflict')

    expect(bindingBody).toContain('registerCapabilityTransportBindingWrite')
    expect(bindingBody).toContain('capabilitySupplyWriterPorts')
    expect(bindingBody).not.toContain('defineCapabilityTransportBindingRegistration')
    expect(bindingBody).not.toContain('admitRegisteredTransport')
    expect(bindingBody).not.toContain('db.insert(')
    expect(bindingBody).not.toContain('binding_identity_conflict')

    expect(eligibilityBody).toContain('setCapabilitySupplyEligibilityWrite')
    expect(eligibilityBody).toContain('capabilitySupplyWriterPorts')
    expect(eligibilityBody).not.toContain('validEligibilityInput')
    expect(eligibilityBody).not.toContain('desiredEligibility')
    expect(eligibilityBody).not.toContain('db.patch(')
    expect(eligibilityBody).not.toContain('registration_changed')
  })

  it('keeps insert/patch/uniqueness queries in the writer ports adapter', () => {
    expect(writerPorts).toContain('db.insert(')
    expect(writerPorts).toContain('db.patch(')
    expect(writerPorts).toContain('by_offeringId')
    expect(writerPorts).toContain('by_bindingId')
    expect(writerPorts).toContain('insertOffering')
    expect(writerPorts).toContain('insertBinding')
    expect(writerPorts).toContain('patchOfferingEligibility')
    expect(writerPorts).toContain('patchBindingEligibility')
    expect(writerPorts).not.toMatch(/defineCapabilityOfferingRegistration/)
    expect(writerPorts).not.toMatch(/desiredEligibility/)
    expect(writerPorts).not.toMatch(/admitRegisteredTransport/)
  })

  it('leaves thin (db,…) writer and Command export arity in the host', () => {
    expect(convexHost).toMatch(/export async function registerCapabilityOffering\s*\(/)
    expect(convexHost).toMatch(/export async function registerCapabilityTransportBinding\s*\(/)
    expect(convexHost).toMatch(/export async function setCapabilitySupplyEligibility\s*\(/)
    expect(convexHost).toMatch(/export async function registerCapabilityOfferingCommand\s*\(/)
    expect(convexHost).toMatch(/export async function registerCapabilityBindingCommand\s*\(/)
    expect(convexHost).toMatch(/export async function setCapabilitySupplyEligibilityCommand\s*\(/)
    expect(convexHost).toContain('runRegisterOfferingCommand(portsFor(db)')
    expect(convexHost).toContain('capabilitySupplyWriterPorts(db)')
  })

  it('keeps writer modules free of Convex runtime imports', () => {
    for (const [folder, file] of [
      ['offering', 'write.ts'],
      ['binding', 'write.ts'],
      ['eligibility', 'write.ts'],
    ] as const) {
      const source = readFileSync(join(moduleRoots[folder], file), 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/\bdb\.(insert|patch|query)\b/)
    }
  })

  it('does not relocate operation-ledger helpers into writer modules', () => {
    for (const folder of Object.values(moduleRoots)) {
      for (const file of listTsFiles(folder)) {
        if (!file.endsWith('/write.ts')) continue
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/\bbeginOperation\b/)
        expect(source).not.toMatch(/\bensureSupplyAudit\b/)
        expect(source).not.toMatch(/registerCapabilityOfferingCommand/)
      }
    }
  })
})


