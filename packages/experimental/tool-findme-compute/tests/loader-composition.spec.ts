import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolFindMeCompute from '@deepseek-ai/dsh-experimental-tool-findme-compute'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllGlobals()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-findme-compute-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-experimental-tool-findme-compute'",
    '  config:',
    "    apiBaseUrl: 'https://hub.example.test/root/'",
    "    adminToken: 'local-admin-token'",
    '    requestTimeoutMs: 5000',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-experimental-tool-findme-compute', ToolFindMeCompute],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  return ctx
}

function execute(ctx: Context, name: string, args: Record<string, unknown> = {}) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId(`test-${name}`),
    name,
    arguments: args,
  })
}

describe('FindMe compute tools through a real Loader composition', () => {
  it('registers five tools and authenticates a catalog request without exposing the token', async () => {
    const seen: { url: string; authorization: string | null }[] = []
    vi.stubGlobal('fetch', async (input: URL | RequestInfo, init?: RequestInit) => {
      seen.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        authorization: new Headers(init?.headers).get('Authorization'),
      })
      return new Response(JSON.stringify({
        data: { items: [{ key: 'mock', modalities: ['TEXT'] }] },
        trace_id: 'trace-1',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const ctx = await boot()

    expect(ctx.tools.schemas().map(tool => tool.name).sort()).toEqual([
      'findme_compute_create_integration',
      'findme_compute_discover_models',
      'findme_compute_list_adapters',
      'findme_compute_list_catalog',
      'findme_compute_verify_integration',
    ])
    const result = await execute(ctx, 'findme_compute_list_adapters', { modality: 'TEXT' })

    expect(result).toMatchObject({
      isError: false,
      value: { data: { items: [{ key: 'mock' }] }, trace_id: 'trace-1' },
    })
    expect(seen).toEqual([{
      url: 'https://hub.example.test/root/admin/v1/compute/adapters?modality=TEXT',
      authorization: 'Bearer local-admin-token',
    }])
    expect(JSON.stringify(result)).not.toContain('local-admin-token')
  })

  it('rejects credential-like fields before the request leaves the Harness', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ctx = await boot()

    const result = await execute(ctx, 'findme_compute_create_integration', {
      provider_key: 'unsafe-provider',
      display_name: 'Unsafe Provider',
      adapter_key: 'openai-compatible',
      non_secret_config: { nested: { api_key: 'must-not-enter-a-session' } },
      endpoint: {
        name: 'primary',
        base_url: 'https://provider.example/v1',
        protocol: 'OPENAI_CHAT',
      },
    })

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{
      type: 'text',
      text: 'Error: non_secret_config.nested.api_key is credential material; use the structured credential form instead',
    }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a bounded API error without the administrator token or raw body', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      error: {
        code: 'REVISION_CONFLICT',
        category: 'CONFLICT',
        retryable: false,
        message: 'configuration changed',
        internal_detail: 'do not render this field',
      },
      trace_id: 'trace-2',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    const ctx = await boot()

    const result = await execute(ctx, 'findme_compute_verify_integration', {
      provider_id: 'provider-1',
      mode: 'AUTH_ONLY',
    })

    expect(result.content).toEqual([{
      type: 'text',
      text: 'Error: AI Hub API HTTP 409 REVISION_CONFLICT: configuration changed (trace trace-2)',
    }])
    expect(JSON.stringify(result)).not.toContain('local-admin-token')
    expect(JSON.stringify(result)).not.toContain('internal_detail')
  })
})
