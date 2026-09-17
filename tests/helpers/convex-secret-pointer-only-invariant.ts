import type { GenericValidator } from 'convex/values'

/** Plaintext or vault-shaped durable fields that must not appear in Convex schema paths. */
export const FORBIDDEN_SECRET_FIELD_NAMES = [
  'clientSecret',
  'apiKey',
  'password',
  'privateKey',
  'accessToken',
  'refreshToken',
  'secretValue',
  'codeVerifier',
  'plaintext',
  'ciphertext',
  'encryptedMaterial',
] as const

/**
 * AE-issued OAuth delivery claim token stored for one-time browser handoff — not
 * provider secret material or vault ciphertext.
 */
export const DELIVERY_CLAIM_TOKEN_ALLOWLIST_PATH = 'agentAccessOAuthGrants.deliveryClaimToken' as const

export type SecretPointerOnlyViolation = {
  readonly tableName: string
  readonly fieldPath: string
  readonly fieldName: typeof FORBIDDEN_SECRET_FIELD_NAMES[number]
}

function isAllowedFieldSegment(fieldName: string): boolean {
  if (fieldName === 'secretRef' || fieldName === 'credentialRef' || fieldName === 'keyId') return true
  if (fieldName.endsWith('Digest') || fieldName.endsWith('Hash') || fieldName.endsWith('Generation')) return true
  if (fieldName.startsWith('kms')) return true
  return false
}

function isForbiddenFieldSegment(
  tableName: string,
  fieldPathSegments: readonly string[],
  fieldName: string,
): fieldName is SecretPointerOnlyViolation['fieldName'] {
  const dottedPath = `${tableName}.${fieldPathSegments.join('.')}`
  if (dottedPath === DELIVERY_CLAIM_TOKEN_ALLOWLIST_PATH) return false
  if (isAllowedFieldSegment(fieldName)) return false
  return (FORBIDDEN_SECRET_FIELD_NAMES as readonly string[]).includes(fieldName)
}

function walkValidatorTree(
  tableName: string,
  validator: GenericValidator,
  fieldPathSegments: readonly string[],
  violations: SecretPointerOnlyViolation[],
): void {
  if (!validator.isConvexValidator) return

  switch (validator.kind) {
    case 'object': {
      for (const [fieldName, fieldValidator] of Object.entries(validator.fields)) {
        const nextPath = [...fieldPathSegments, fieldName]
        if (isForbiddenFieldSegment(tableName, nextPath, fieldName)) {
          violations.push({
            tableName,
            fieldPath: nextPath.join('.'),
            fieldName,
          })
        }
        walkValidatorTree(tableName, fieldValidator, nextPath, violations)
      }
      return
    }
    case 'union': {
      for (const member of validator.members) {
        walkValidatorTree(tableName, member, fieldPathSegments, violations)
      }
      return
    }
    case 'array': {
      walkValidatorTree(tableName, validator.element, [...fieldPathSegments, '[]'], violations)
      return
    }
    case 'record': {
      walkValidatorTree(tableName, validator.value, [...fieldPathSegments, '*'], violations)
      return
    }
    default:
      return
  }
}

export function findSecretPointerOnlyViolations(
  tables: Record<string, { validator: GenericValidator }>,
): SecretPointerOnlyViolation[] {
  const violations: SecretPointerOnlyViolation[] = []
  for (const [tableName, table] of Object.entries(tables)) {
    walkValidatorTree(tableName, table.validator, [], violations)
  }
  return violations.sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))
}

export function assertSecretPointerOnlySchema(
  tables: Record<string, { validator: GenericValidator }>,
): void {
  const violations = findSecretPointerOnlyViolations(tables)
  if (violations.length === 0) return
  const summary = violations
    .map((violation) => `${violation.tableName}.${violation.fieldPath} (${violation.fieldName})`)
    .join('; ')
  throw new Error(`Convex schema stores forbidden secret material fields: ${summary}`)
}
