---
trigger: model_decision
description: sequential-thinking MCPを使用する場合
---


## Sequential Thinking MCP
構造化された反復推論による問題解決を実現。
### When to Use
- 複数の相互接続された推論ステップが必要
- 初期スコープやアプローチが不確実
- 以前の結論をバックトラックまたは修正する必要がある
- 代替ソリューションパスを探索したい
### 使用方法
`mcp_sequential-thinking_sequentialthinking` ツールを使用:
#### Required Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `thought` | string | 現在の推論ステップ |
| `nextThoughtNeeded` | boolean | さらなる推論が必要か |
| `thoughtNumber` | integer | 現在のステップ番号 (1から開始) |
| `totalThoughts` | integer | 必要な総ステップ数の見積もり |
#### Optional Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `isRevision` | boolean | 前の思考を修正するか |
| `revisesThought` | integer | 再検討する思考番号 |
| `branchFromThought` | integer | 分岐元の思考番号 |
| `branchId` | string | 分岐の識別子 |
### Workflow
1. 初期思考から開始 (thoughtNumber: 1)
2. 各ステップで推論を表現し、`totalThoughts` を動的に調整
3. 結論に達したら `nextThoughtNeeded: false` に設定
### Tips
- `totalThoughts` は大まかな見積もりから始め、進行に応じて調整
- 仮定が間違っていることが判明したらリビジョンを使用
- 複数のアプローチが有効な場合はブランチを使用