/**
 * Model-facing non-secret administration tools for the FindMe AI Hub compute
 * registry. Provider credentials use a separate structured UI-to-API path and
 * never enter tool arguments, results, or Session events.
 * @module @deepseek-ai/dsh-experimental-tool-findme-compute
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createApiRequest, assertNoSecretFields, type ApiEnvelope } from './api-client.ts'

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

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    data: { type: 'object', additionalProperties: true, required: true },
    trace_id: { type: 'string', required: true },
  },
} as const

function compact(value: ApiEnvelope): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** Register non-secret compute management tools; publication is UI-only. */
export function apply(ctx: Context, config: Config): void {
  const baseUrl = new URL(config.apiBaseUrl.endsWith('/') ? config.apiBaseUrl : `${config.apiBaseUrl}/`)
  const request = createApiRequest(config)
  if (!Number.isSafeInteger(config.requestTimeoutMs)) {
    throw new Error('tool-findme-compute: requestTimeoutMs must be a positive safe integer')
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

  ctx.tools.register(defineTool({
    name: 'findme_compute_create_logical_model',
    description: 'Create a stable text logical model draft. Does not publish a route.',
    parameters: { key: { type: 'string', required: true }, display_name: { type: 'string', required: true } },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute: (args, exec) => request('admin/v1/logical-models', { method: 'POST', body: { ...args, modality: 'TEXT' } }, exec.signal),
    presentCall: args => ({ card: 'generic', title: `Draft logical model ${args.key}`, kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'findme_compute_propose_routing_policy',
    description: 'Save an ordered primary/backup routing draft for human review. Cannot publish or change an active version.',
    parameters: {
      logical_model_id: { type: 'string', required: true },
      target_ids: { type: 'array', required: true, items: { type: 'string' } },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute: (args, exec) => request('admin/v1/routing-policies', { method: 'POST', body: args }, exec.signal),
    presentCall: () => ({ card: 'generic', title: 'Propose routing policy for review', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'findme_compute_test_routing_policy',
    description: 'Queue a text trial of a routing draft. May incur provider charges. Reuse the idempotency key when retrying admission.',
    parameters: {
      policy_id: { type: 'string', required: true }, prompt: { type: 'string', required: true },
      idempotency_key: { type: 'string', required: true },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute: (args, exec) => request(`admin/v1/routing-policies/${encodeURIComponent(args.policy_id)}:test`, {
      method: 'POST', body: { input: { messages: [{ role: 'user', content: args.prompt }], max_tokens: 256 }, idempotency_key: args.idempotency_key },
    }, exec.signal),
    presentCall: () => ({ card: 'generic', title: 'Test routing policy', kind: 'execute' }),
  }))
  ctx.tools.register(defineTool({
    name: 'findme_compute_query_invocation_trace',
    description: 'Read invocation status, attempts, usage and failover reasons without provider credentials.',
    parameters: { invocation_id: { type: 'string', required: true } },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => compact(value) },
    execute: (args, exec) => request(`admin/v1/invocations/${encodeURIComponent(args.invocation_id)}/trace`, {}, exec.signal),
    presentCall: () => ({ card: 'generic', title: 'Read invocation trace', kind: 'read' }),
  }))
}
