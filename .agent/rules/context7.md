---
trigger: model_decision
description: Context7 MCPを使用する場合
---

## Context7 MCP
一般的なライブラリの最新ドキュメント検索に使用。
### 使用手順
1. `mcp_context7_resolve-library-id` でライブラリIDを解決
2. `mcp_context7_get-library-docs` でドキュメントを取得
3. 必要に応じて `topic` と `page` パラメータで絞り込み
### 優先順位
1. **Context7** - 最初に試す
2. **Web検索** - Context7に情報がない場合のフォールバック