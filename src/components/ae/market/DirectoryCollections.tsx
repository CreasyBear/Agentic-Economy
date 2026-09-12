import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'

// Editorial entry points execute ordinary directory searches. The artwork is
// decorative aecon.ai brand art, never a purported output or Provider asset.
const collections = [
  { title: 'Research something', query: 'web search research', image: 'archive-light', description: 'Search, sources & answers' },
  { title: 'Find the right data', query: 'data analytics', image: 'radio-array', description: 'Signals, facts & analysis' },
  { title: 'Create something', query: 'image audio generation', image: 'orbital-panel', description: 'Images, audio & content' },
  { title: 'Work with the web', query: 'web scraping browser', image: 'telescope-mirror', description: 'Browsers, pages & extraction' },
] as const

export function DirectoryCollections() {
  return <nav aria-label="Explore by job" className="grid auto-cols-[72%] grid-flow-col gap-3 overflow-x-auto pb-1 md:auto-cols-auto md:grid-flow-row md:grid-cols-4">
    {collections.map(collection => <Link key={collection.title} to="/market" search={{ query: collection.query }} className="group relative isolate min-h-36 overflow-hidden rounded-card bg-foreground text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
      <img src={`/media/market/${collection.image}-small.webp`} alt="" aria-hidden="true" width={640} height={360} className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" />
      <div className="absolute inset-0 -z-10 bg-foreground/60" />
      <div className="flex h-full flex-col justify-end gap-1 p-4 sm:p-5">
        <span className="flex items-center justify-between gap-2 text-sm font-semibold sm:text-base">{collection.title}<ArrowUpRightIcon className="size-4 shrink-0" /></span>
        <span className="text-xs text-background/90">{collection.description}</span>
      </div>
    </Link>)}
  </nav>
}
