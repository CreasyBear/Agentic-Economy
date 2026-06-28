export type JsonLdPrimitive = string | number | boolean
export type JsonLdValue = JsonLdPrimitive | JsonLdObject | readonly JsonLdValue[]
export type JsonLdObject = {
  readonly [key: string]: JsonLdValue
}

export function serializeJsonLd(objects: readonly JsonLdObject[]): string {
  return JSON.stringify(objects).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
}
