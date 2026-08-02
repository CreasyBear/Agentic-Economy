import { toast } from '@/lib/ui/toast'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'

function threadUrl(threadId: string): string {
  return `${window.location.origin}/t/${threadId}`
}

export async function copyThreadLink(threadId: string): Promise<void> {
  try {
    await copyTextToClipboard(threadUrl(threadId))
    toast.success('Thread link copied.')
  } catch {
    toast.error('Could not copy the thread link.')
  }
}
