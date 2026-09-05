---
description: "在显式源码组合中管理 FindMe AI Hub 算力注册表的五个非敏感模型工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-findme-compute

[English](README.md) | 中文

## 概述

`dsh-experimental-tool-findme-compute` 让 Harness Agent 通过 FindMe AI Hub Admin API 查看已安装 Adapter、创建 Provider 与 Endpoint 草稿、验证草稿、发现 Provider Model，并读取归一化 Compute Target 目录。它是私有源码插件，不属于 DeepSeek Harness 官方发布包。

插件不接受 Provider 凭据。结构化桌面表单会把凭据直接提交给 API，因此凭据不会进入模型请求、工具调用、工具结果或 Session 日志。仅供 Host 使用的 Admin API Token 是 secret 配置字段，只用于 HTTP Authorization Header。

## 目录

- [使用本包](#use-this-package)
- [设计](#design)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用方式

在已有 `dsh-tools` 的显式 Patch 中挂载插件：

```yaml
- id: findme-compute-tools
  name: '@deepseek-ai/dsh-experimental-tool-findme-compute'
  config:
    apiBaseUrl: 'http://127.0.0.1:8000'
    adminToken: !!js process.env.FINDME_AI_HUB_ADMIN_TOKEN
    requestTimeoutMs: 30000
```

三个字段均为必填项。`apiBaseUrl` 只接受 HTTP 或 HTTPS，不能包含凭据、Query 或 Fragment。除调用方取消信号外，`requestTimeoutMs` 还会限制每次请求的最长时间。

五个工具为：

- `findme_compute_list_adapters`
- `findme_compute_create_integration`
- `findme_compute_verify_integration`
- `findme_compute_discover_models`
- `findme_compute_list_catalog`

完整 Schema 由生成的[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-experimental-tool-findme-compute)维护。每次成功都以紧凑 JSON 返回 API 的 `{ data, trace_id }` Envelope。HTTP 失败只暴露状态、结构化错误 Code 与 Message，以及 Trace id；不会回显请求 Header 或无界响应正文。

-----

<a id="design"></a>
## 设计

AI Hub API 仍然负责验证、持久化、Adapter 选择、网络访问与审计。该插件是轻量 Consumer，只把五个模型操作映射到已有 Admin API Endpoint。它会在发送请求前拒绝开放非敏感配置对象中的常见凭据字段名，也会拒绝成功 API 响应中的凭据材料字段。

插件不发布 Runtime Invariant 配套模块。除激活时的不可变配置外，它不拥有状态；所有持久算力记录均由 API 管理。

-----

<a id="model-experience"></a>
## Model Experience

### 工具 Schema 与结果

#### What the model sees

生成的[五个 FindMe 算力工具 Schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-experimental-tool-findme-compute)。结果是紧凑的 `{ data, trace_id }` JSON。Schema 不包含凭据写入、轮换或撤销操作。

#### Token effect

插件挂载时产生固定 Schema 成本，每次调用再产生一个紧凑结果或有界错误。

#### KV Cache effect

插件版本与可见范围不变时，Schema 保持 Prefix-stable。调用和结果追加在可复用请求前缀之后。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **凭据管理需要独立 UI** — Agent 可以创建草稿，但不能提供验证所需的 Provider Secret；结构化桌面表单是唯一凭据入口。
- **不提供生产调用工具** — 本包只管理 M1 算力注册表，不暴露项目生成、路由策略、计费或能力执行。
- **没有专用 Web Card** — 在 Compute Center UI 提供专用视图前，Web Client 使用通用工具展示。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
