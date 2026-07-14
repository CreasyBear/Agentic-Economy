import { createFileRoute, redirect } from '@tanstack/react-router'


export const Route = createFileRoute('/i/$threadId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/t/$threadId',
      params: { threadId: params.threadId },
      statusCode: 301,
    })
  },
  component: LegacyRecordRedirect,
})

function LegacyRecordRedirect() {
  return null
}
