export type LocalDevelopmentEnvironment = { dev: boolean; hostname: string }

export function isLocalDevelopment({ dev, hostname }: LocalDevelopmentEnvironment) {
  return dev && (hostname === 'localhost' || hostname === '127.0.0.1')
}

// The adapter is the test injection boundary; production uses Vite's build flag.
export function getLocalDevelopmentEnvironment(): LocalDevelopmentEnvironment {
  return { dev: import.meta.env.DEV, hostname: window.location.hostname }
}
