import { createContext, use } from 'react'

export const OperatorCommandOpenContext = createContext<(() => void) | null>(null)

export function useOpenOperatorCommand(): (() => void) | null {
  return use(OperatorCommandOpenContext)
}
