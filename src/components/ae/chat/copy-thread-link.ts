import { toast } from '@/lib/ui/toast'

export function threadUrl(threadId: string): string {
  return `${window.location.origin}/t/${threadId}`
}

export async function copyThreadLink(threadId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(threadUrl(threadId))
    toast.success('Thread link copied.')
  } catch {
    toast.error('Could not copy the thread link.')
  }
}
