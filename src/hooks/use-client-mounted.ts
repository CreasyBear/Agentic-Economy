import { useSyncExternalStore } from 'react'

function subscribeClientMounted(): () => void {
  return () => {}
}

function getClientMountedSnapshot(): boolean {
  return true
}

function getServerMountedSnapshot(): boolean {
  return false
}

/** True only after the component has mounted in the browser. */
export function useClientMounted(): boolean {
  return useSyncExternalStore(
    subscribeClientMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  )
}
