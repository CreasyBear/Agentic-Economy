import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ActiveGuard = Readonly<{ pending: boolean; unknown: boolean; focus: () => void }>
type PublishGuard = (owner: symbol, guard: ActiveGuard | undefined) => void
const SafetyOwners = createContext<Readonly<{ active: ActiveGuard | undefined; publish: PublishGuard }> | undefined>(undefined)

/** Mount-local navigation owners broadcast only status and focus, never commands or secrets. */
export function AeNavigationSafetyProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [owners, setOwners] = useState<ReadonlyMap<symbol, ActiveGuard>>(() => new Map())
  const publish = useCallback<PublishGuard>((owner, guard) => {
    setOwners(previous => {
      if (guard === undefined && !previous.has(owner)) return previous
      const next = new Map(previous)
      if (guard === undefined) next.delete(owner)
      else next.set(owner, guard)
      return next
    })
  }, [])
  const value = useMemo(() => {
    const active = [...owners.values()].find(guard => guard.pending)
      ?? [...owners.values()].find(guard => guard.unknown)
      ?? [...owners.values()].at(-1)
    return { active, publish }
  }, [owners, publish])
  return <SafetyOwners.Provider value={value}>{children}</SafetyOwners.Provider>
}

export function useNavigationSafetyPublisher() { return useContext(SafetyOwners)?.publish }
export function useActiveNavigationSafetyGuard() { return useContext(SafetyOwners)?.active }
