import { reverificationError } from '@clerk/shared/authorization-errors'
import { useReverification } from '@clerk/tanstack-react-start'
import { useRef } from 'react'

export function useTypedReverification<A extends unknown[], R>(
  request: (...args: A) => Promise<R>,
  requiredLevel: (result: R) => 'strict' | 'strict_mfa' | null,
): (...args: A) => Promise<R> {
  const attempted = useRef(false)
  const verifiedRequest = useReverification(async (...args: A) => {
    const result = await request(...args)
    const level = requiredLevel(result)
    if (level !== null && !attempted.current) {
      attempted.current = true
      return reverificationError(level)
    }
    return result
  })

  return async (...args: A) => {
    attempted.current = false
    return await verifiedRequest(...args)
  }
}
