import { Toaster } from '@/components/ui/sonner'
import { useClientMounted } from '@/hooks/use-client-mounted'

export function AeToaster() {
  const mounted = useClientMounted()

  if (!mounted) {
    return null
  }

  return <Toaster position="top-center" closeButton richColors duration={4500} />
}
