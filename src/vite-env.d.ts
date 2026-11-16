/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'server' to use the books server; anything else keeps the books in this browser. */
  readonly VITE_BACKEND?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
