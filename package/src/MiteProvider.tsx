import { createContext, useContext } from 'react'
import type { Mite } from './Mite'

const MiteContext = createContext<Mite | null>(null)

export type MiteProviderProps = { children: React.ReactNode } & (
  | { client: Mite; miteInstance?: never }
  | {
      /** @deprecated Use `client`. Removed in 2.0. */
      miteInstance: Mite
      client?: never
    }
)

export function MiteProvider(props: MiteProviderProps) {
  const mite = props.client ?? props.miteInstance
  return <MiteContext.Provider value={mite}>{props.children}</MiteContext.Provider>
}

export function useMite() {
  const mite = useContext(MiteContext)
  if (!mite) {
    throw new Error('useMite must be used within a MiteProvider')
  }
  return mite
}
