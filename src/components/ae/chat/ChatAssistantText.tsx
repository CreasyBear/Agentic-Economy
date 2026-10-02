import { isValidElement, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { ChatCodeFence } from './ChatCodeFence'
import './TranscriptComposition.css'

export type ChatAssistantTextProps = Readonly<{
  text: string
}>

function fenceCode(children: ReactNode): string {
  if (typeof children === 'string') return children.replace(/\n$/, '')
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map((child) => fenceCode(child)).join('')
  if (isValidElement<{ children?: ReactNode }>(children)) return fenceCode(children.props.children)
  return ''
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function ChatAssistantText({ text }: ChatAssistantTextProps) {
  return (
    <div className="arc-market arc-chat arc-transcript-prose">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const safe = safeHttpUrl(href)
            if (safe === undefined) return <span>{children}</span>
            return (
              <a href={safe} rel="noreferrer" target="_blank">
                {children}
              </a>
            )
          },
          img: () => null,
          pre: ({ children }) => <ChatCodeFence code={fenceCode(children)}>{children}</ChatCodeFence>,
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}
