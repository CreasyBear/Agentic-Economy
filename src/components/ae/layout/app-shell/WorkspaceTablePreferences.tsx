import { useAuth } from '@clerk/tanstack-react-start'
import type { ReactNode } from 'react'
import { AeTablePreferencesProvider } from '@/components/ae/operator/AeTablePreferencesContext'

/** Browser presentation preferences use external identity scope, never authority or record content. */
export function WorkspaceTablePreferences({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const scope = auth.isLoaded && auth.userId ? {
    actorRef: `clerk/user:${auth.userId}`,
    accountRef: auth.orgId ? `clerk/organization:${auth.orgId}` : `clerk/personal:${auth.userId}`,
  } : undefined
  return <AeTablePreferencesProvider {...(scope === undefined ? {} : { scope })}>{children}</AeTablePreferencesProvider>
}
