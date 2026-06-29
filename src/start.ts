import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { createSourceWriteAdmissionMiddleware } from '@/lib/server/source-write-admission'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})
const sourceWriteAdmissionMiddleware = createSourceWriteAdmissionMiddleware()
const clerkRequestMiddleware = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true' ? [] : [clerkMiddleware()]

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, sourceWriteAdmissionMiddleware, ...clerkRequestMiddleware],
}))
