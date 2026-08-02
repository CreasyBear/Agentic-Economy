import { customAlphabet } from 'nanoid'

const createRandomSuffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6)

export function createPrefixedRandomId(prefix: string): string {
  return `${prefix}${createRandomSuffix()}`
}
