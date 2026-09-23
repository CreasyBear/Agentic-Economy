export type ProviderToolActionOutcome = Readonly<{
  kind: 'applied' | 'refused'
  message: string
}>

export type ProviderToolAction = () => Promise<ProviderToolActionOutcome>
