// Type declarations for apiProxy.js (kept as plain JS so Node can run it at
// runtime without a build step).

import type { RequestListener } from "node:http"

export interface ProxyConfig {
  verifierApiUrl: string
  verifierName: string
  verifierToken: string | undefined
  issuerApiUrl: string
  issuers: Record<string, string>
  issuerToken: string | undefined
}

export function proxyConfigFromEnv(env: Record<string, string | undefined>): ProxyConfig
export function assertProxyConfig(config: ProxyConfig): void
export function mountApiProxy<T>(app: T, config: ProxyConfig): T
export function createApiProxyApp(config: ProxyConfig): RequestListener
