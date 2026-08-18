import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules, ownerAdmin } from '../helpers/convex-fixtures'

describe('V1 routing history readback', () => {
  it('requires source-owned admin readback authority and never mutates history', async () => {
    const backend = convexTest(schema, modules)

    await expect(backend.query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: 'binding:history' },
    })).resolves.toEqual({ kind: 'authorization_denied' })
    await expect(backend.withIdentity({
      subject: 'user_without_admin_membership', issuer: 'https://identity.example', tokenIdentifier: 'token_without_admin_membership',
    }).query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: 'binding:history' },
    })).resolves.toEqual({ kind: 'authorization_denied' })
  })

  it('returns typed not-found for every historical reference after RK tables unlist', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_history_admin')

    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: 'binding:history' },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'binding', ref: 'binding:history' })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'grant', grantId: 'grant:history' },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'grant', ref: 'grant:history' })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'preparation', preparationRequestId: 'preparation:history' },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'preparation', ref: 'preparation:history' })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'run', rootRunId: 'run:history' },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'run', ref: 'run:history' })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'run', rootRunId: 'run:missing' },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'run', ref: 'run:missing' })
    await expect(admin.query(api.routingKernelV1History.read, {
      reference: { kind: 'binding', bindingId: ` ${'x'.repeat(250)}` },
    })).resolves.toEqual({ kind: 'not_found', referenceKind: 'binding', ref: 'invalid_reference' })
  })
})
