/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POLLINATIONS_API_KEY: string
  readonly VITE_LLM_API_KEY: string
  readonly VITE_LLM_BASE_URL: string
  readonly VITE_LLM_MODEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.mp3' {
  const src: string;
  export default src;
}

declare module '*.zip' {
  const src: string;
  export default src;
}
