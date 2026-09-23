'use client'

import { useEffect } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const kbdClassName =
  'font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border text-foreground/70'

type ShortcutRow = {
  keys: string
  description: string
}

const navigationShortcuts: ShortcutRow[] = [
  { keys: '⌘K', description: 'Open command console' },
  { keys: '⌘B', description: 'Toggle operator sidebar' },
  { keys: '/', description: 'Focus search in command console' },
  { keys: '?', description: 'Toggle keyboard shortcuts cheatsheet' },
  { keys: 'Esc', description: 'Dismiss active overlay / pop layer' },
]

const traversalShortcuts: ShortcutRow[] = [
  { keys: '↑ / ↓', description: 'Move selection' },
  { keys: '↵', description: 'Confirm / Open selection' },
]

function ShortcutCategory({
  title,
  rows,
}: Readonly<{
  title: string
  rows: ShortcutRow[]
}>) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.keys} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{row.description}</span>
            <kbd className={kbdClassName}>{row.keys}</kbd>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Global shortcuts work outside text fields and editable content.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          <ShortcutCategory title="Navigation & Console" rows={navigationShortcuts} />
          <ShortcutCategory title="Item Traversal" rows={traversalShortcuts} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useGlobalShortcuts({
  onOpenShortcuts,
  isShortcutsOpen = false,
}: Readonly<{
  onOpenShortcuts: () => void
  isShortcutsOpen?: boolean
}>): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if (event.key !== '?') return
      if (isTextEntryTarget(event.target)) return

      event.preventDefault()
      onOpenShortcuts()
    }

    window.addEventListener('keydown', onKeyDown, { capture: false })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: false })
  }, [isShortcutsOpen, onOpenShortcuts])
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target.isContentEditable
    || target.closest('[contenteditable="true"]') !== null
  )
}
