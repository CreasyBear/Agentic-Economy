declare const toolRefBrand: unique symbol

export type PublicToolRef = string & Readonly<{ [toolRefBrand]: true }>

export function isPublicToolRef(value: unknown): value is PublicToolRef {
  return typeof value === 'string' && /^operation:v1:[0-9a-f]{64}$/.test(value)
}
