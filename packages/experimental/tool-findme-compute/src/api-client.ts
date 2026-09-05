/** Shared host-only HTTP client for structured management and Agent tools. */

import type { Config } from './index.ts'

/** JSON values accepted by the authenticated API client. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
/** JSON object accepted at the HTTP boundary. */
export interface JsonObject { [key: string]: JsonValue }
/** Successful AI Hub response with a trace reference. */
export interface ApiEnvelope { data: JsonObject; trace_id: string }

const BLOCKED_SECRET_KEYS = new Set([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'ciphertext',
  'password',
  'secret',
  'secretkey',
  'secretvalue',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

/** Reject credential-like fields before they can enter a logged tool call or result. */
export function assertNoSecretFields(value: JsonValue, location: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoSecretFields(item, `${location}[${index}]`)
    })
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (BLOCKED_SECRET_KEYS.has(normalizedKey(key))) {
      throw new Error(`${location}.${key} is credential material; use the structured credential form instead`)
    }
    assertNoSecretFields(item, `${location}.${key}`)
  }
}

function apiBaseUrl(raw: string): URL {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('tool-findme-compute: apiBaseUrl must use http or https')
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('tool-findme-compute: apiBaseUrl cannot contain credentials, query, or fragment')
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

function errorMessage(status: number, payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error)) return `AI Hub API request failed with HTTP ${status}`
  const code = typeof payload.error.code === 'string' ? ` ${payload.error.code}` : ''
  const message = typeof payload.error.message === 'string' ? `: ${payload.error.message}` : ''
  const trace = typeof payload.trace_id === 'string' ? ` (trace ${payload.trace_id})` : ''
  return `AI Hub API HTTP ${status}${code}${message}${trace}`
}

function envelope(payload: unknown): ApiEnvelope {
  if (!isRecord(payload) || !isJsonValue(payload.data) || !isRecord(payload.data) || typeof payload.trace_id !== 'string') {
    throw new Error('AI Hub API returned an invalid success envelope')
  }
  assertNoSecretFields(payload.data, 'AI Hub API response')
  return { data: payload.data, trace_id: payload.trace_id }
}


/** Create authenticated requests without exposing the administrator token. */
export function createApiRequest(config: Config) {
  const baseUrl = apiBaseUrl(config.apiBaseUrl)
  return async function request(
    path: string,
    options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH'; body?: JsonObject } = {},
    signal: AbortSignal,
  ): Promise<ApiEnvelope> {
    const response = await fetch(new URL(path, baseUrl), {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.adminToken}`,
        ...options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      },
      ...options.body === undefined ? {} : { body: JSON.stringify(options.body) },
      signal: AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)]),
    })
    const payload: unknown = await response.json().catch(() => undefined)
    if (!response.ok) throw new Error(errorMessage(response.status, payload))
    return envelope(payload)
  }

}
