import type { OperatorSurface } from '@/lib/operator/operator-context'

export const ADMIN_OPERATOR_FORBIDDEN_COPY = Object.freeze({
  title: 'Admin access required',
  description: 'Your account does not have the Admin role for this page.',
  supportAction: 'Ask an Admin for access',
  marketAction: 'Return to Market',
})

export const operatorForbiddenCopy = Object.freeze({
  admin: ADMIN_OPERATOR_FORBIDDEN_COPY,
  owner: Object.freeze({
    ...ADMIN_OPERATOR_FORBIDDEN_COPY,
    title: 'Workspace access required',
    description: 'Your account does not have access to this Workspace.',
  }),
  developer: Object.freeze({
    ...ADMIN_OPERATOR_FORBIDDEN_COPY,
    title: 'Developer access required',
    description: 'Your account does not have access to this developer page.',
  }),
} satisfies Record<OperatorSurface, Readonly<{
  title: string
  description: string
  supportAction: string
  marketAction: string
}>>)
