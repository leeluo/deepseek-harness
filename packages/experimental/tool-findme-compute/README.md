---
description: "Five non-secret model-facing tools for administering the FindMe AI Hub compute registry from an explicit source-checkout composition."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-findme-compute

English | [中文](README.zh.md)

## Summary

`dsh-experimental-tool-findme-compute` lets a Harness Agent inspect installed adapters, create a Provider and Endpoint draft, verify that draft, discover Provider Models, and read the normalized Compute Target catalog through the FindMe AI Hub Admin API. It is a private source-checkout plugin and is not part of official DeepSeek Harness releases.

The plugin never accepts Provider credentials. A structured desktop form sends those values directly to the API, so they do not enter a model request, tool call, result, or Session log. The host-only Admin API token is a secret configuration field and is used only in the HTTP authorization header.

## Table of Contents

- [Use this package](#use-this-package)
- [Design](#design)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin beside `dsh-tools` in an explicit patch:

```yaml
- id: findme-compute-tools
  name: '@deepseek-ai/dsh-experimental-tool-findme-compute'
  config:
    apiBaseUrl: 'http://127.0.0.1:8000'
    adminToken: !!js process.env.FINDME_AI_HUB_ADMIN_TOKEN
    requestTimeoutMs: 30000
```

All three fields are required. `apiBaseUrl` accepts only HTTP or HTTPS and cannot contain credentials, a query, or a fragment. `requestTimeoutMs` bounds each request in addition to cancellation from the calling tool execution.

The five tools are:

- `findme_compute_list_adapters`
- `findme_compute_create_integration`
- `findme_compute_verify_integration`
- `findme_compute_discover_models`
- `findme_compute_list_catalog`

The generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-experimental-tool-findme-compute) owns their complete schemas. Every success returns the API's `{ data, trace_id }` envelope as compact JSON. HTTP failures expose only the status, structured error code and message, and trace id; they never echo request headers or an unbounded response body.

-----

<a id="design"></a>
## Design

The AI Hub API remains the authority for validation, persistence, Adapter selection, network access, and audit. This plugin is a thin Consumer that maps five model-facing operations to existing Admin API endpoints. It rejects common credential field names inside open non-secret configuration objects before sending a request and rejects credential material fields in successful API responses.

No runtime invariant companion is published. The plugin owns no state beyond immutable activation configuration, and the API owns every durable compute record.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas and results

#### What the model sees

The generated [five FindMe compute tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-experimental-tool-findme-compute). Results are compact `{ data, trace_id }` JSON. The schemas omit credential write, rotation, and revocation operations.

#### Token effect

Fixed schema cost while the plugin is mounted, plus one compact result or bounded error per call.

#### KV Cache effect

The schemas are prefix-stable while the plugin version and visibility are unchanged. Calls and results append after the reusable request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Credential administration requires a separate UI** — an Agent can create a draft but cannot supply the Provider secret needed for verification; the structured desktop form is intentionally the only credential path.
- **No production invocation tools** — this package administers the M1 compute registry and does not expose project generation, routing policy, billing, or capability execution.
- **No specialized Web card** — the Web Client uses the generic tool presentation until the Compute Center UI owns a dedicated view.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
