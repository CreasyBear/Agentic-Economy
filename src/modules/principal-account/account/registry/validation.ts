import {
  AccountRegistryError,
  type AccountRef,
  type MembershipRef,
  type OwnershipRef,
} from './contracts'

const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const OWNERSHIP_REF_PATTERN = /^own_[0-9a-f]{32}$/u
const MEMBERSHIP_REF_PATTERN = /^mem_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

export function isAccountRef(value: string): value is AccountRef {
  return ACCOUNT_REF_PATTERN.test(value)
}

export function accountRef(value: string): AccountRef {
  if (!isAccountRef(value)) throw new AccountRegistryError('account_ref_invalid')
  return value
}

export function ownershipRef(value: string): OwnershipRef {
  if (!OWNERSHIP_REF_PATTERN.test(value)) throw new AccountRegistryError('ownership_ref_invalid')
  return value as OwnershipRef
}

export function membershipRef(value: string): MembershipRef {
  if (!MEMBERSHIP_REF_PATTERN.test(value)) throw new AccountRegistryError('membership_ref_invalid')
  return value as MembershipRef
}

export function generateAccountRef(randomUuid: () => string = () => globalThis.crypto.randomUUID()): AccountRef {
  return accountRef(generateStableRef('acc', randomUuid))
}

export function generateOwnershipRef(randomUuid: () => string = () => globalThis.crypto.randomUUID()): OwnershipRef {
  return ownershipRef(generateStableRef('own', randomUuid))
}

export function generateMembershipRef(randomUuid: () => string = () => globalThis.crypto.randomUUID()): MembershipRef {
  return membershipRef(generateStableRef('mem', randomUuid))
}

export function generateStableRef(prefix: 'acc' | 'own' | 'mem' | 'sau', randomUuid: () => string): string {
  const uuid = randomUuid()
  if (!UUID_PATTERN.test(uuid)) {
    const code = prefix === 'acc'
      ? 'account_ref_invalid'
      : prefix === 'own'
        ? 'ownership_ref_invalid'
        : prefix === 'mem' ? 'membership_ref_invalid' : 'succession_authorization_invalid'
    throw new AccountRegistryError(code)
  }
  return `${prefix}_${uuid.replaceAll('-', '')}`
}
