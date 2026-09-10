'use client'

import { useEffect } from 'react'

export function useCommandPanelHotKeys({
  isOpen,
  onEscape,
  onOpen,
  onToggle,
}: Readonly<{
  isOpen: boolean
  onEscape: () => void
  onOpen: () => void
  onToggle: () => void
}>): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if (isOpen && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onEscape()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onToggle()
        return
      }
      if (
        event.key !== '/'
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || event.shiftKey
        || isOpen
        || isTextEntryTarget(event.target)
      ) return
      event.preventDefault()
      onOpen()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isOpen, onEscape, onOpen, onToggle])
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
}
