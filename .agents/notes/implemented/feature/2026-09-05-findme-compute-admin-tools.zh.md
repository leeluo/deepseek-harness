# Agent Note: Non-secret FindMe compute administration tools

Status: implemented

[English](2026-09-05-findme-compute-admin-tools.md) | 中文

## Problem

FindMe AI Hub 使用 DeepSeek Harness 作为智能管理终端，独立 API 则持有持久算力源状态。Agent 需要结构化操作来查看 Adapter、创建接入草稿、请求服务端验证、发现模型以及读取归一化目录。如果 Provider 凭据也通过同一工具通道发送，它就会持久化到工具调用与 Session 日志，并可能进入后续模型上下文。

桌面组合还必须作为 Harness 扩展存在，而不能成为 Agent Loop 的 Fork；这样升级上游 Harness 时，无需把业务行为反复合并进核心控制流。

## Decision

私有包 `@deepseek-ai/dsh-experimental-tool-findme-compute` 在 `ctx.tools` 注册九个工具。每个工具调用已有 FindMe AI Hub Admin API Endpoint，并返回结构化 `{ data, trace_id }` 成功 Envelope。API 继续负责验证、Adapter 执行、持久化、网络策略与审计。

工具 Schema 不包含 Provider 凭据写入、轮换或撤销。专用结构化桌面表单会把 Provider Secret 直接提交给 API。开放的非敏感配置对象会在传输前拒绝常见凭据字段名；包含凭据材料字段的成功 API Envelope 也会在成为工具结果前被拒绝。Admin API Bearer Token 是必填 Host Secret 配置值，绝不会进入工具参数或结果。

该包位于 `packages/experimental/`，只由 Family AI Hub 源码 Overlay 显式挂载。它不修改 Agent Loop 或随产品发布的默认 Profile。

共享的 `src/api-client.ts` 为结构化桌面 Host 与工具复用认证和响应校验。Agent 使用独立的服务端权限令牌，可创建逻辑模型和路由草稿、试调用及读取 Trace；API 拒绝其发布与凭据变更。

## Alternatives considered

**把凭据管理作为另一个模型工具暴露。** 拒绝，因为完整参数与结果会进入 Harness 工具 Pipeline 和 Session 日志。执行后再脱敏太迟，无法阻止 Secret 进入模型编写的调用。

**把算力源状态保存在 Harness Session 中。** 拒绝，因为桌面进程关闭后项目仍需使用这些配置，而 Session Event 也不是服务端验证、路由或审计的权威数据源。

**在 Agent Loop 中加入 FindMe 专用行为。** 拒绝，因为工具注册已经提供所需扩展点，并能让业务集成与上游控制流隔离。

## Testing

真实 Loader Composition 从 `cordis.yml` 启动插件，验证九个注册 Schema，执行带认证请求，证明凭据型输入会在传输前被拒绝，并证明有界 API 错误不会暴露 Admin Token 或原始错误字段。

## Consequences

Agent 无需修改 Harness Core 或持有持久状态，即可完成非敏感算力注册表工作。新建接入只有在独立结构化表单保存凭据后才能进入验证，因此首个管理 UI 必须包含该路径。该包不进入官方发布 Bundle，并需要与桌面仓库固定的 Harness Fork 源码版本保持兼容。
