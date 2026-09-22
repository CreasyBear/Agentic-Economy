import {
  parseCallRef,
  parseQuoteRef,
} from '@/modules/capability-execution/call-contracts'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { parseBusinessSlug } from '@/modules/business/public'
import { accountRef } from '@/modules/principal-account/account/public'
import { principalRef } from '@/modules/principal-account/principal/public'
import type {
  AdminObjectKind,
  AdminParseResult,
} from './contracts'

const accountRefPattern = /^acc_[0-9a-f]{32}$/u
const principalRefPattern = /^prn_[0-9a-f]{32}$/u

export function parseAdminObjectRef(
  kind: AdminObjectKind,
  input: string,
): AdminParseResult {
  const value = input.trim()
  if (value.length === 0) return { kind: 'malformed', code: 'empty' }

  switch (kind) {
    case 'call': {
      const parsed = parseCallRef(value)
      return parsed.kind === 'valid'
        ? { kind: 'valid', ref: { kind, ref: parsed.ref } }
        : { kind: 'malformed', code: 'malformed_call_ref' }
    }
    case 'quote': {
      const parsed = parseQuoteRef(value)
      return parsed.kind === 'valid'
        ? { kind: 'valid', ref: { kind, ref: parsed.ref } }
        : { kind: 'malformed', code: 'malformed_quote_ref' }
    }
    case 'tool_version':
      return isPublicToolRef(value)
        ? { kind: 'valid', ref: { kind, ref: value } }
        : { kind: 'malformed', code: 'malformed_tool_ref' }
    case 'workspace':
      return accountRefPattern.test(value)
        ? { kind: 'valid', ref: { kind, ref: accountRef(value) } }
        : { kind: 'malformed', code: 'malformed_account_ref' }
    case 'agent':
      return principalRefPattern.test(value)
        ? { kind: 'valid', ref: { kind, ref: principalRef(value) } }
        : { kind: 'malformed', code: 'malformed_principal_ref' }
    case 'provider': {
      const parsed = parseBusinessSlug(value)
      return parsed.kind === 'valid'
        ? { kind: 'valid', ref: { kind, ref: parsed.slug } }
        : { kind: 'malformed', code: 'malformed_slug' }
    }
  }
}
