/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POLLINATIONS_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.mp3' {
  const src: string;
  export default src;
}
