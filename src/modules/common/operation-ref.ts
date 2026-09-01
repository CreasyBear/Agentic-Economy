declare const operationRefBrand: unique symbol

export type PublicOperationRef = string & Readonly<{ [operationRefBrand]: true }>

export function isPublicOperationRef(value: unknown): value is PublicOperationRef {
  return typeof value === 'string' && /^operation:v1:[0-9a-f]{64}$/.test(value)
}
