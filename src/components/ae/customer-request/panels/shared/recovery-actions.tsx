import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export function RecoveryActions({ edit, restart }: { edit: () => void; restart: () => void }) { return <div className="flex flex-wrap gap-3 pt-4"><Separator className="basis-full" /><Button type="button" variant="secondary" onClick={edit}>Edit this Request</Button><Button type="button" variant="ghost" onClick={restart}>Start a new Request</Button></div> }
