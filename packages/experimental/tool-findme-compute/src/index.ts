/**
 * Model-facing non-secret administration tools for the FindMe AI Hub compute
 * registry. Provider credentials use a separate structured UI-to-API path and
 * never enter tool arguments, results, or Session events.
 * @module @deepseek-ai/dsh-experimental-tool-findme-compute
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-findme-compute'
export const inject = ['tools']

/** Host configuration for the FindMe AI Hub Admin API. */
export interface Config {
  /** Base URL of the independently running AI Hub API. */
  apiBaseUrl: string
  /** Administrator bearer token; host-only and never projected into a tool schema. */
  adminToken: string
  /** Maximum duration of one Admin API request in milliseconds. */
  requestTimeoutMs: number
}

/** Schemastery configuration for the FindMe compute tool plugin. */
export const Config: z<Config> = z.object({
  apiBaseUrl: z.string().required(),
  adminToken: z.string().role('secret').required(),
  requestTimeoutMs: z.number().min(1).required(),
})

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
interface JsonObject { [key: string]: JsonValue }
interface ApiEnvelope { data: JsonObject; trace_id: string }

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    data: { type: 'object', additionalProperties: true, required: true },
    trace_id: { type: 'string', required: true },
  },
} as const

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
function assertNoSecretFields(value: JsonValue, location: string): void {
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

function compact(value: ApiEnvelope): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** Register the five non-secret compute registry tools. */
export function apply(ctx: Context, config: Config): void {
  const baseUrl = apiBaseUrl(config.apiBaseUrl)
  if (!Number.isSafeInteger(config.requestTimeoutMs)) {
    throw new Error('tool-findme-compute: requestTimeoutMs must be a positive safe integer')
  }

  async function request(
    path: string,
    options: { method?: 'GET' | 'POST'; body?: JsonObject } = {},
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

  ctx.tools.register(defineTool({
    name: 'findme_compute_list_adapters',
    description: 'List server-installed compute adapters, optionally filtered by modality.',
    parameters: {
      modality: { type: 'string', description: 'Optional modality such as TEXT, IMAGE, VIDEO, or AUDIO.' },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute(args, exec) {
      const path = new URL('admin/v1/compute/adapters', baseUrl)
      if (args.modality !== undefined) path.searchParams.set('modality', args.modality)
      return request(`${path.pathname}${path.search}`, {}, exec.signal)
    },
    presentCall: () => ({ card: 'generic', title: 'List FindMe compute adapters', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'findme_compute_create_integration',
    description: 'Create a non-secret Provider and primary Endpoint draft. Never pass credentials or API keys.',
    parameters: {
      provider_key: { type: 'string', required: true, description: 'Stable lowercase provider key.' },
      display_name: { type: 'string', required: true, description: 'Administrator-facing provider name.' },
      adapter_key: { type: 'string', required: true, description: 'Key returned by findme_compute_list_adapters.' },
      non_secret_config: { type: 'object', additionalProperties: true, description: 'Provider metadata with no credential fields.' },
      endpoint: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          base_url: { type: 'string', required: true },
          protocol: { type: 'string', required: true },
          region: { type: 'string' },
          timeout_ms: { type: 'number' },
          enabled: { type: 'boolean' },
          config: { type: 'object', additionalProperties: true },
        },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute(args, exec) {
      const nonSecretConfig = args.non_secret_config ?? {}
      const endpointConfig = args.endpoint.config ?? {}
      assertNoSecretFields(nonSecretConfig, 'non_secret_config')
      assertNoSecretFields(endpointConfig, 'endpoint.config')
      return request('admin/v1/compute-integrations', {
        method: 'POST',
        body: {
          provider_key: args.provider_key,
          display_name: args.display_name,
          adapter_key: args.adapter_key,
          non_secret_config: nonSecretConfig,
          endpoint: {
            name: args.endpoint.name,
            base_url: args.endpoint.base_url,
            protocol: args.endpoint.protocol,
            ...args.endpoint.region === undefined ? {} : { region: args.endpoint.region },
            ...args.endpoint.timeout_ms === undefined ? {} : { timeout_ms: args.endpoint.timeout_ms },
            ...args.endpoint.enabled === undefined ? {} : { enabled: args.endpoint.enabled },
            config: endpointConfig,
          },
        },
      }, exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `Create compute integration ${args.provider_key}`, kind: 'other' }),
  }))

  ctx.tools.register(defineTool({
    name: 'findme_compute_verify_integration',
    description: 'Ask the AI Hub API runtime to verify one integration from the server environment.',
    parameters: {
      provider_id: { type: 'string', required: true, description: 'Provider UUID returned when the draft was created.' },
      mode: { type: 'string', required: true, enum: ['AUTH_ONLY', 'AUTH_AND_MINIMAL_CALL'] },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute: (args, exec) => request(
      `admin/v1/compute-integrations/${encodeURIComponent(args.provider_id)}:verify`,
      { method: 'POST', body: { mode: args.mode } },
      exec.signal,
    ),
    presentCall: args => ({ card: 'generic', title: `Verify compute integration ${args.provider_id}`, kind: 'execute' }),
  }))

  ctx.tools.register(defineTool({
    name: 'findme_compute_discover_models',
    description: 'Discover Provider Models through a verified integration and update Compute Targets idempotently.',
    parameters: {
      provider_id: { type: 'string', required: true, description: 'Provider UUID returned when the draft was created.' },
      refresh: { type: 'boolean', required: true, description: 'Whether the API should refresh the upstream model list.' },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute: (args, exec) => request(
      `admin/v1/compute-integrations/${encodeURIComponent(args.provider_id)}:discover-models`,
      { method: 'POST', body: { refresh: args.refresh } },
      exec.signal,
    ),
    presentCall: args => ({ card: 'generic', title: `Discover models for ${args.provider_id}`, kind: 'search' }),
  }))

  ctx.tools.register(defineTool({
    name: 'findme_compute_list_catalog',
    description: 'Read the normalized Compute Target catalog with optional provider, modality, operation, and status filters.',
    parameters: {
      provider_id: { type: 'string' },
      modality: { type: 'string' },
      operation: { type: 'string' },
      status: { type: 'string' },
      cursor: { type: 'string' },
      limit: { type: 'number', description: 'Page size from 1 to 200.' },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute(args, exec) {
      if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 200)) {
        throw new Error('limit must be a whole number from 1 to 200')
      }
      const path = new URL('admin/v1/compute/catalog', baseUrl)
      for (const [key, value] of Object.entries(args)) {
        path.searchParams.set(key, String(value))
      }
      return request(`${path.pathname}${path.search}`, {}, exec.signal)
    },
    presentCall: () => ({ card: 'generic', title: 'Read FindMe compute catalog', kind: 'read' }),
  }))
}
