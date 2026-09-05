# Agent Note: Non-secret FindMe compute administration tools

Status: implemented

English | [中文](2026-09-05-findme-compute-admin-tools.zh.md)

## Problem

FindMe AI Hub uses DeepSeek Harness as an intelligent management terminal while an independent API owns durable compute-source state. An Agent needs structured operations for inspecting adapters, creating an integration draft, asking the server to verify it, discovering models, and reading the normalized catalog. Sending Provider credentials through the same tool channel would persist them in tool calls and Session logs and may include them in later model context.

The desktop composition also needs to remain an extension of Harness rather than a fork of the Agent loop, so upstream Harness updates do not require replaying business behavior into core control flow.

## Decision

The private `@deepseek-ai/dsh-experimental-tool-findme-compute` package registers five tools on `ctx.tools`. Each tool calls an existing FindMe AI Hub Admin API endpoint and returns its structured `{ data, trace_id }` success envelope. The API remains responsible for validation, Adapter execution, persistence, network policy, and audit.

Provider credential write, rotation, and revocation are absent from the tool schemas. A dedicated structured desktop form sends Provider secrets directly to the API. Open non-secret configuration objects reject common credential field names before transport, and successful API envelopes containing credential-material fields are rejected before they become tool results. The Admin API bearer token is a required Host secret configuration value and is never included in a tool argument or result.

The package is opt-in under `packages/experimental/` and is mounted only by the Family AI Hub source overlay. It makes no changes to the Agent loop or shipped default profiles.

## Alternatives considered

**Expose credential administration as another model-facing tool.** Rejected because the complete arguments and result enter the Harness tool pipeline and Session log. Redaction after execution would be too late to prevent the secret from reaching the model-authored call.

**Store compute-source state inside Harness sessions.** Rejected because the desktop process may be closed while projects still need the configuration, and Session events are not the authority for server validation, routing, or audit.

**Patch the Agent loop with FindMe-specific behavior.** Rejected because tool registration already supplies the required extension point and keeps the business integration isolated from upstream control flow.

## Testing

A real Loader composition boots the plugin from `cordis.yml`, verifies the five registered schemas, executes an authenticated request, proves credential-like input is rejected before transport, and proves bounded API errors do not expose the Admin token or raw error fields.

## Consequences

The Agent can complete non-secret compute registry work without changes to Harness core and without owning durable state. A newly created integration cannot become verifiable until the separate structured form stores its credential, so the first management UI must include that path. The package remains outside official release bundles and must be kept compatible with the forked Harness source revision pinned by the desktop repository.
