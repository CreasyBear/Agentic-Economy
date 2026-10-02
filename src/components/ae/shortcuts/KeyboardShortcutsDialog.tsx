'use client'

import { useEffect } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/arc/button/button'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import './ShortcutsComposition.css'

const kbdClassName = 'arc-shortcut-key'

type ShortcutRow = {
  keys: string
  description: string
}

const navigationShortcuts: ShortcutRow[] = [
  { keys: '⌘K', description: 'Open command console' },
  { keys: '/', description: 'Focus search in command console' },
  { keys: '?', description: 'Open keyboard shortcuts' },
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
    <section className="arc-shortcut-category">
      <h3>{title}</h3>
      <ul className="arc-shortcut-rows">
        {rows.map((row) => (
          <li key={row.keys}>
            <span>{row.description}</span>
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
      <DialogContent className="arc-market arc-shortcuts" showCloseButton={false} instant>
        <DialogHeader className="arc-shortcuts-header">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Global shortcuts work outside text fields and editable content.
          </DialogDescription>
        </DialogHeader>
        <DialogClose render={<Button type="button" variant="ghost" size="md" className="arc-shortcuts-close" aria-label="Close keyboard shortcuts" />}>
          <XIcon aria-hidden="true" />
        </DialogClose>
        <div className="arc-shortcuts-body">
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
