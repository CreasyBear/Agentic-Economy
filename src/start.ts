import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})
const clerkRequestMiddleware = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true' ? [] : [clerkMiddleware()]

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, ...clerkRequestMiddleware],
}))
