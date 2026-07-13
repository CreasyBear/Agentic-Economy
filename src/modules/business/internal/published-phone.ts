export type OwnerPublishedPhoneValidation =
  | { kind: 'absent' }
  | { kind: 'valid'; value: string }
  | { kind: 'invalid' }

export function validateOwnerPublishedPhone(value: string | undefined): OwnerPublishedPhoneValidation {
  const normalized = value?.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length === 0) {
    return { kind: 'absent' }
  }
  if (!/^[+\d(][\d\s()-]*$/.test(normalized)) {
    return { kind: 'invalid' }
  }

  const digits = normalized.replace(/\D/g, '')
  const valid = normalized.startsWith('+')
    ? normalized.startsWith('+61') && digits.length === 11
    : (digits.startsWith('0') && digits.length === 10) ||
      ((digits.startsWith('1300') || digits.startsWith('1800')) && digits.length === 10) ||
      (digits.startsWith('13') && digits.length === 6)
  return valid ? { kind: 'valid', value: normalized } : { kind: 'invalid' }
}
