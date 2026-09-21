import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SETTINGS_DIALOG_DIR = 'src/components/ae/settings/settings-dialog'

function settingsDialogSourceFiles(): string[] {
  const files: string[] = []
  for (const entry of readdirSync(SETTINGS_DIALOG_DIR, { withFileTypes: true })) {
    const path = join(SETTINGS_DIALOG_DIR, entry.name)
    if (entry.isDirectory()) {
      for (const nested of readdirSync(path)) {
        if (nested.endsWith('.tsx') || nested.endsWith('.ts')) {
          files.push(join(path, nested))
        }
      }
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }
  return files
}

describe('AeSettingsDialog source guard', () => {
  it('does not import AeOperatorPage or OwnerSettingsShell', () => {
    for (const file of settingsDialogSourceFiles()) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      const source = readFileSync(file, 'utf8')
      expect(source.includes('AeOperatorPage'), file).toBe(false)
      expect(source.includes('OwnerSettingsShell'), file).toBe(false)
    }
  })
})
