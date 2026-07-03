import { useEffect } from 'react'
import { ToastViewport, useToast } from '@astryxdesign/core/Toast'

import { useClientMounted } from '@/hooks/use-client-mounted'
import { subscribeToAeToasts } from '@/lib/ui/toast'

export function AeToaster() {
  const mounted = useClientMounted()
  const showToast = useToast()

  useEffect(() => {
    return subscribeToAeToasts((event) => {
      showToast({
        body: event.description === undefined ? event.title : `${event.title} ${event.description}`,
        type: toastTypeToAstryx(event.type),
      })
    })
  }, [showToast])

  if (!mounted) {
    return null
  }

  return <ToastViewport position="bottomEnd" maxVisible={5} />
}

function toastTypeToAstryx(type: 'success' | 'error' | 'info' | 'warning'): 'info' | 'error' {
  return type === 'error' ? 'error' : 'info'
}
