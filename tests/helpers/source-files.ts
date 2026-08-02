import { globSync } from 'node:fs'
import { join } from 'node:path'

export function listTsFiles(directory: string): string[] {
  return globSync(join(directory, '**/*.ts')).sort()
}
