import { Agent, mockModel } from '@convex-dev/agent'
import { expect, test } from 'vitest'
import { components } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

test('the mounted Agent component persists a thread message', async () => {
  const backend = convexTestWithMarketComponents()
  const agent = new Agent(components.agent, {
    name: 'component-smoke-test',
    languageModel: mockModel(),
  })

  const { threadId, messageId } = await backend.run(async (ctx) => {
    const thread = await agent.createThread(ctx, {
      userId: 'component-smoke-user',
      title: 'Mounted component smoke test',
    })
    const message = await agent.saveMessage(ctx, {
      threadId: thread.threadId,
      userId: 'component-smoke-user',
      message: { role: 'user', content: 'Persist this message.' },
      skipEmbeddings: true,
    })
    return { threadId: thread.threadId, messageId: message.messageId }
  })

  const messages = await backend.run((ctx) =>
    agent.listMessages(ctx, {
      threadId,
      paginationOpts: { cursor: null, numItems: 10 },
      statuses: ['success'],
    }),
  )

  expect(messageId).toBeTypeOf('string')
  expect(messages.page).toHaveLength(1)
  expect(messages.page[0]).toMatchObject({
    _id: messageId,
    userId: 'component-smoke-user',
    message: { role: 'user', content: 'Persist this message.' },
  })
})
