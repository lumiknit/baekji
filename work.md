# lib/doc 마이그레이션 작업 노트

## 현황 파악

### 기존 구조 (lib/db.ts)

- DB: `baekji-db` v2
- Stores: `projects` (ProjectMeta), `nodes` (Node + projectId)
- Node.data는 any: group → `{children: string[], color?}`, sheet → `{content: string, selection?}`
- 순서는 부모 group의 `data.children` 배열 순서로 관리

### 신규 구조 (lib/doc/v0.ts)

- DB: `baekji-doc-v0` v0
- Stores: `projects`, `nodes` (DocNode), `sheetContents`, `sheetDrafts`, `appState`
- 순서: 각 node의 `orderKey` (fractional index)
- 부모: 각 node의 `parentId`
- 색상: `visual.colorH / colorS`
- content: SheetNode에 없음 → `sheetContents` store 별도
- 프로젝트 버전 개념: `versionRoot` 노드 (type='versionRoot', active:boolean)

### `projects` store에 무엇을 저장하나?

- `docProjectItemSchema`가 v0.ts에서 제거됨
- versionRoot 노드에 `projectId`+`active` 플래그가 있어 노드 목록에서 프로젝트를 파악 가능
- 그러나 사용자가 명시적으로 `'projects' (ProjectItem)` store를 언급함
- **→ 확인 필요: projects store에 무엇을 넣을지? 아니면 projects store가 아직 필요한지?**

### 타입 관련 이슈

- `docVersionRootSchema`의 inferred type이 v0.ts에서 named export 없음
  - 해결: `Extract<DocNode, { type: 'versionRoot' }>` 패턴 사용 가능 (새 타입 추가 불필요)
- `orderKey` 주석이 "fractional indexing in integers" → 정수인지 실수인지 모호
  - `z.number()`로 선언되어 있으므로 실수도 허용됨. 실제 구현에서 정수만 쓸지 확인 필요

## 구현할 파일 목록

### lib/doc/db.ts

- `getDB()`: baekji-doc-v0, version 0
- Stores & indexes:
  - `projects`: keyPath='id' (내용 TBD)
  - `nodes`: keyPath='id', index: [projectId], [type], [parentId], [versionId]
  - `sheetContents`: keyPath='sheetId'
  - `sheetDrafts`: keyPath='sheetId'
  - `appState`: keyPath=[scope, scopeId, key] (compound)
- 주요 함수:
  - getVersionRoot(projectId, activeOnly?): versionRoot 조회
  - getActiveVersionId(projectId): active versionRoot의 id
  - getChildren(parentId): parentId index로 자식 조회, orderKey로 정렬
  - getNode/putNode/deleteNode
  - getSheetContent/putSheetContent
  - getSheetDraft/putSheetDraft/deleteSheetDraft
  - getStateKV/setStateKV (scope, scopeId, key)
  - orderKey 재정렬: 중복 감지 시 재할당 (정수 fractional)
  - deleteVersionSubtree: versionRoot + 하위 모든 nodes + sheetContents 삭제 (트랜잭션)

### lib/doc/db_helper.ts

- freezeSheetDraft(sheetId): draft의 ProseMirror JSON → markdown 변환 후 sheetContent에 저장, draft 삭제
- getEffectiveContent(sheetId): sheetDraft 있으면 그걸 변환해서 반환, 없으면 sheetContent 반환
- collectText(versionId, nodeId, options): 하위 트리 텍스트 수집 (export용)

### lib/doc/backup.ts

- doc→bak: exportProject(projectId) → BakProject
  - active versionRoot 기준으로 노드 트리 조회
  - node ID는 인덱스 기반 재매핑 (UUID 불필요)
  - sheetContent를 bakSheetNode.content에 포함
- bak→doc: parseAndValidateBak(raw) → BakProject (zod validation)
- importBakProject(bak): BakProject → DB 삽입 준비 객체 반환
  - 모든 node ID를 genId()로 재매핑
  - projectId 중복 여부 체크 포함
  - 실제 DB 삽입은 하지 않고 결과 반환 (caller가 결정)

### lib/doc/backup_helper.ts

- serializeBak(bak: BakProject): Uint8Array (JSON → gzip)
- deserializeBak(data: Uint8Array | Blob): BakProject (gunzip → JSON → zod parse)

### lib/doc/export.ts

- ExportFormat = 'md' | 'txt' | 'html'
- buildExportBlob(versionId, nodeId, format, includeHidden): Blob
- printExport(versionId, nodeId, includeHidden): void

## 기존 코드 사용 패턴 → 신규 대응

| 기존                         | 신규                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `Node.data.children`         | `getChildren(parentId)` sorted by orderKey                       |
| `Node.data.content`          | `getSheetContent(sheetId)`                                       |
| `Node.data.color`            | `DocNode.visual.colorH/colorS`                                   |
| `ProjectMeta.lastOpenNodeId` | `getStateKV('project', projectId, SK_LAST_OPEN_NODE_ID)`         |
| `Node.data.selection`        | `getStateKV('sheet', sheetId, SK_SHEET_LAST_SELECTION)`          |
| `ProjectMeta.rootNodeId`     | active versionRoot의 id                                          |
| `getAllNodes(projectId)`     | `getChildren(versionId)` recursive                               |
| `updateLastOpenNode`         | `setStateKV('project', projectId, SK_LAST_OPEN_NODE_ID, nodeId)` |

## 미확인 사항 (사용자에게 질문 필요)

1. **`projects` store 내용**: `docProjectItemSchema` 제거됐는데, `projects` store에 어떤 스키마를 넣을지?
   - 단순히 프로젝트 ID 목록용? 아니면 다른 메타데이터?
   - 혹은 versionRoot 노드로 projects를 대체하고 store 이름이 다른 용도?

2. **`orderKey`가 정수인지 실수인지**: 주석에 "integers"라고 되어 있지만 fractional indexing은 보통 실수. 정수 기반이면 재정렬 시 간격이 모자랄 수 있어서 rebuild가 필요한 시점이 생김.

3. **gzip**: Web 환경이므로 `CompressionStream` API (Web API, 별도 패키지 불필요) 사용 예정. 확인 필요.
