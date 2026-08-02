export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    throw new Error('Clipboard API not available')
  }
  await navigator.clipboard.writeText(text)
}
