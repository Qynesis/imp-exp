import { createContext, useContext, type ComponentType, type ReactNode } from 'react'

/** A sheet component. Mark `readOnlySafe` when it only shows information, so view-only roles may open it. */
export type SheetComponent<P> = ComponentType<P> & { readOnlySafe?: boolean }

export interface SheetsApi {
  /** Open a sheet on top of the current screen. Props are type-checked against the component. */
  open<P extends object>(component: SheetComponent<P>, ...props: object extends P ? [props?: P] : [props: P]): void
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  destructive?: boolean
}

export const SheetsContext = createContext<SheetsApi | null>(null)
export const SheetItemContext = createContext<{ close: () => void; closing: boolean }>({ close: () => undefined, closing: false })
export const ToastContext = createContext<(message: string) => void>(() => undefined)
export const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false))
export const PrintContext = createContext<(doc: ReactNode) => void>(() => undefined)

export function useSheets(): SheetsApi {
  const v = useContext(SheetsContext)
  if (!v) throw new Error('useSheets must be used inside <UIProvider>')
  return v
}
/** Inside a sheet: close it, and whether it is animating out. */
export const useSheetItem = () => useContext(SheetItemContext)
export const useToast = () => useContext(ToastContext)
export const useConfirm = () => useContext(ConfirmContext)
export const usePrint = () => useContext(PrintContext)
