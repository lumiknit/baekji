# Baekji

BaekJi (백지) is a 'blank paper' in Korean.
Simple and minimal writing tool for any platform, including desktop and mobile.

## Introduction

Baekji is a writing tool with a minimal footprint.
It provides a focused environment for writing that requires little to no document formatting.

### Goals

- Manage writing in a Project → Sheet structure with tag-based filtering
- Markdown editor with live preview
- Easy export and sharing
- No installation required — works in any browser on desktop or mobile
- PWA support for offline use like a native app

### Non-goals

- Full markdown support or complex document formatting
- Collaboration, media management, etc.
- Diagrams, tables, or anything beyond plain writing
- Hierarchical folder/group structures

---

## How to Use

### Content Structure

Baekji organizes writing in a flat **Project → Sheet** structure.

- **Project**: The top-level unit, containing sheets.
- **Sheet**: A single piece of writing, written and stored as Markdown.

All data is saved automatically in the browser and persists unless you explicitly clear browser storage.

### Sidebar

The sidebar can be opened and closed with the button in the top-left corner (or `Ctrl+L` / `Cmd+L`).

At the top of the sidebar you can switch between the **project list** and the **sheet list** of the current project.

### Projects

From the project list you can create a new project or import an existing backup file (`.json`).

Projects are fully independent and do not affect each other.

**Backup**: All project data can be exported as a single `.json` file. To use Baekji across multiple devices, export this file to a cloud storage service (or Dropbox) and import it on each device.

### How to Organize Your Writing

Baekji is intentionally flat — there are no folders or nested groups. Instead, the recommended approach is:

- **Keep sheets in rough order** — drag them into a sequence that makes sense. Think of the sheet list as a long scroll of paper: position carries meaning.
- **Use tags to cross-cut** — a sheet can have multiple tags, so it can belong to several "categories" at once without duplication.
- **Namespace your tags with a colon** — this is a convention, not a rule, but `작품:A`, `작품:B` or `project:alpha` groups related tags under a common prefix. You can then query `작품:*` to match all of them at once.

**Example workflow**: for a fiction project, you might tag each sheet with both a work name and a content type:

| Sheet           | Tags             |
| --------------- | ---------------- |
| 작품A 1화 초안  | `작품:A`, `본문` |
| 작품A 설정 메모 | `작품:A`, `설정` |
| 작품B 1화 초안  | `작품:B`, `본문` |
| 아이디어 노트   | `아이디어`       |

Then `작품:* & 본문` shows every body draft across all works, `작품:A` shows everything for work A, and `!본문` shows everything that is not body text.

---

### Sheet List

The sheet list shows all sheets in the current project as a scrollable linear list.

- Sheets can be **reordered** by dragging them.
- Use the **tag filter** at the top to filter sheets by tags. Only sheets matching all specified tags are shown.
- Multiple sheets can be **selected** for bulk operations. Use `Shift+click` for range selection or `Ctrl/Cmd+click` for individual selection.
  - Selected sheets can be deleted in bulk.
  - When exactly **two** sheets are selected, you can open the **Compare** view to diff and merge them.
- Deleted sheets go to the **Trash** section at the bottom of the list. You can restore them or empty the trash permanently.

**Context menu** (right-click or `...` on a sheet item):

- Edit tags
- View analysis
- Export
- Insert a new sheet above / below
- Merge down (merge with the next sheet)
- Delete

### Tags

Each sheet can have one or more tags assigned. Tags are used to filter and organize sheets within a project.

- To add or edit tags on a sheet, use the context menu and select **Tags**.
- In the tag filter input, type a tag name to narrow the sheet list to matching sheets.
- Tag colors can be customized from the **Project** overview page.

#### Tag Query Syntax

The filter input and search accept a boolean query language:

| Syntax     | Meaning                                     | Example                   |
| ---------- | ------------------------------------------- | ------------------------- |
| `tag`      | Sheets that have this exact tag             | `본문`                    |
| `prefix:*` | Sheets with any tag starting with `prefix:` | `작품:*`                  |
| `*`        | Sheets that have at least one tag           | `*`                       |
| `A & B`    | AND — both conditions must match            | `작품:A & 본문`           |
| `A \| B`   | OR — either condition matches               | `초안 \| 수정`            |
| `!A`       | NOT — condition must not match              | `!삭제예정`               |
| `(…)`      | Grouping                                    | `작품:* & (초안 \| 수정)` |

Whitespace around operators is ignored. An empty query matches all sheets.

**Tips**:

- Colon (`:`) is just a regular character in a tag name — `작품:A` is a single tag. Using it as a namespace separator is a convention that makes glob queries like `작품:*` useful.
- `!work:* & (draft | revision)` — sheets that have no `work:` tag but are either a draft or a revision.
- When you create a new sheet while a filter is active, the required tags are pre-filled automatically.

### Sheets

A sheet is equivalent to a file in other applications. Sheets have no explicit title — the first line of the content is used as the display name.

The editor is a **plain Markdown editor with live preview**. There is no toolbar for formatting — you write Markdown directly and the editor renders it as you type:

- `# ` → Heading 1, `## ` → Heading 2, `### ` → Heading 3
- `- ` or `* ` → Bullet list, `1. ` → Numbered list
- `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``
- `> ` → Blockquote, ` ``` ` → Code block

The top-right overlay shows a character count. The **`...`** button there opens a menu with:

- **Find & Replace** (`Ctrl+F` / `Cmd+F`)
- **Copy** — copy the full content to clipboard
- **Export** — export this sheet
- **Analysis** — open the analysis view for this sheet
- **Split** — split the sheet at the cursor position into two sheets

When you reopen a sheet, the cursor is restored to where you left off.

**Autosave**: Changes are saved automatically. To save manually, press `Ctrl+S` (macOS: `Cmd+S`).

### Compare & Merge

To compare two sheets and merge them:

1. Enter selection mode in the sheet list and select exactly two sheets.
2. Tap the **Compare** button that appears.
3. In the Compare view, each differing chunk shows **Keep** and **Skip** buttons.
   - **Keep** (`A` / `B` label) — include this chunk in the result
   - **Skip** — discard this chunk
4. Once all chunks are resolved, tap the checkmark button to finalize the merge. The result is saved to the first sheet and the second sheet is moved to trash.

### Export

The Export page lets you combine sheets into a single document. Available formats:

- **Markdown** — raw Markdown with a customizable separator between sheets
- **Plain Text** — Markdown symbols stripped, plain readable text
- **HTML** — a complete HTML document with `DOCTYPE` and `charset`

You can also filter which sheets to include by tag query or by selecting specific sheets before opening Export.

### Analysis

The Analysis page shows statistics for each sheet (and totals):

- Byte size
- Total character count
- Characters excluding whitespace
- Characters excluding special characters
- Word count
- Estimated reading time (based on 200 WPM)

### Settings

The following can be configured in Settings:

- **Theme**: Choose Default, Warm, or Cool for both light and dark mode independently
- **Typography**: Font family (sans-serif or serif), individual font choices for sans / serif / mono (including Noto fonts for multilingual support), editor and preview font size, font weight, line height, first-line indent, paragraph spacing, and text alignment
  - Enabling Noto fonts provides multilingual support but requires up to 30 MB download.
- **Editor**: Typewriter mode (keeps the cursor vertically centered), Focus mode (dims non-active lines)

### Keyboard Shortcuts

| Shortcut                 | Action         |
| ------------------------ | -------------- |
| `Ctrl+L` / `Cmd+L`       | Toggle sidebar |
| `Ctrl+S` / `Cmd+S`       | Save           |
| `Ctrl+Z` / `Cmd+Z`       | Undo           |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo           |
| `Ctrl+F` / `Cmd+F`       | Find & Replace |

### PWA (Install as App)

Baekji supports PWA (Progressive Web App). Use your browser's "Add to Home Screen" or "Install App" option to run it as a standalone app that works offline.
