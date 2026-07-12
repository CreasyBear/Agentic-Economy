import { canonicalAuthorityDigest, isCanonicalAuthorityDigest } from './authority-digest'
import type { DisclosureGrant } from './model'

type Input = Omit<DisclosureGrant, 'disclosureGrantDigest' | 'fields' | 'enforcementPoint'> & Readonly<{ fields: readonly string[] }>

export function createDisclosureGrant(input: Input): DisclosureGrant {
  const grant = {
    ...input,
    fields: Object.freeze([...new Set(input.fields)].sort()),
    enforcementPoint: 'data_release' as const,
  }
  return Object.freeze({ ...grant, disclosureGrantDigest: canonicalAuthorityDigest(grant) })
}

export function isValidDisclosureGrant(grant: DisclosureGrant): boolean {
  const { disclosureGrantDigest, ...material } = grant
  return grant.enforcementPoint === 'data_release'
    && isCanonicalAuthorityDigest(grant.quoteDigest)
    && isCanonicalAuthorityDigest(grant.requestDigest)
    && isCanonicalAuthorityDigest(grant.projectionDigest)
    && grant.fields.length > 0
    && grant.fields.every((field, index, fields) => field.length > 0 && (index === 0 || fields[index - 1]! < field))
    && disclosureGrantDigest === canonicalAuthorityDigest(material)
}

export function sameDisclosureGrant(left: DisclosureGrant, right: DisclosureGrant): boolean {
  return left.disclosureGrantDigest === right.disclosureGrantDigest
    && canonicalAuthorityDigest(left) === canonicalAuthorityDigest(right)
}
