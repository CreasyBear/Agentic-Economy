import type { SourcesInlineProps } from './generative.contracts'
import '../TranscriptComposition.css'

export function SourcesInline({ view }: SourcesInlineProps) {
  if (view.sources.length === 0) return null
  return (
    <nav aria-label="Answer sources" className="arc-market arc-chat arc-answer-sources">
      <p className="arc-answer-sources-heading">Sources</p>
      <ol className="arc-answer-sources-list">
      {view.sources.map((source, index) => (
        <li key={source.toolRef}><a href={source.href} className="arc-answer-source-row"
          aria-label={`Source ${index + 1}: ${source.title}${source.attribution ? `, ${source.attribution}` : ''}`}>
          <span className="arc-answer-source-index" aria-hidden="true">{index + 1}</span>
          <span className="arc-answer-source-text"><span className="arc-answer-source-title">{source.title}</span>
            {source.attribution ? <span className="arc-answer-source-attribution">{source.attribution}</span> : null}
          </span>
        </a></li>
      ))}</ol>
    </nav>
  )
}
