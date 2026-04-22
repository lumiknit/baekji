# Baekji

BaekJi (백지) is a 'blank paper' in Korean.
Simple and minimal writing tool for any platform, including desktop and mobile.

## Introduction

Baekji is a writing tool with a minimal footprint.
It provides a focused environment for writing that requires little to no document formatting.

### Goals

- Manage writing in a Project → Group → Sheet structure
- Simple markdown-based rich-text editor
- Easy export and sharing
- No installation required — works in any browser on desktop or mobile
- PWA support for offline use like a native app

### Non-goals

- Full markdown support or complex document formatting
- Collaboration, media management, etc.
- Diagrams, tables, or anything beyond plain writing

---

## How to Use

### Content Structure

Baekji organizes all writing in a **Project → Group → Sheet** hierarchy.

- **Project**: The top-level unit, containing groups and sheets.
- **Group**: A folder-like container for sheets and sub-groups.
- **Sheet**: A single piece of writing, stored as markdown.

Groups and sheets work similarly to folders and files. They form a tree and can be freely nested. Items are not sorted automatically — you can reorder them by dragging with a mouse, or long-pressing on touch devices.

All data is saved automatically in the browser and persists unless you explicitly clear browser storage.

### Sidebar

The sidebar can be opened and closed with the button in the top-left corner. The keyboard shortcut is `Ctrl+\` (macOS: `Cmd+\`).

At the top of the sidebar you can switch between the **project list** and the **current project tree**.

Click any item in the tree to open it, or press the `...` button to rename, recolor, move, or delete it.

To delete multiple items at once, use the **list view** toggle in the top-right of the tree to enter multi-select mode.

### Projects

From the project list you can create a new project or import an existing backup file (`.json`).

Projects are fully independent and do not affect each other.

**Backup**: All project data can be exported as a single `.json` file. To use Baekji across multiple devices, export this file to a cloud storage service and import it on each device.

### Groups

Clicking a group shows its contents as a card grid of sheets and sub-groups.

- **Export**: Merges all sheets in the group into a single document and exports it as markdown, HTML, or plain text. Export order follows the tree order.
- **Import from file**: Imports `.md` or `.txt` files as sheets, or restores an entire subtree from a `.json` backup.
- **Analysis**: Shows per-sheet character count, word count, and byte size in a table.

Group names are for organizational purposes only and are not included in exported output. Groups whose names start with `.` are treated as hidden and excluded from exports by default.

### Sheets

A sheet is equivalent to a file in other applications. Sheets have no explicit title — the first line of the content is used as the display name.

The editor is a rich-text editor, but does not support arbitrary fonts, font sizes, or general formatting. Only a set of markdown-compatible formats are supported: headings, bold, italic, strikethrough, lists, blockquotes, and code blocks.

**Formatting can be applied in two ways:**

1. Using the **toolbar** at the top of the editor
2. Markdown shorthand input (only for rules enabled in Settings):
   - `# ` → Heading 1, `## ` → Heading 2, `### ` → Heading 3
   - `- ` or `* ` → Bullet list, `1. ` → Numbered list
   - `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``
   - `> ` → Blockquote, ` ``` ` → Code block

The status bar at the bottom of the editor shows the last saved time and character/word counts. Clicking it navigates to the analysis page.

When you reopen a sheet, the cursor is restored to where you left off.

**Autosave**: The sheet is saved automatically after a short idle period. To save manually, press `Ctrl+S` (macOS: `Cmd+S`).

### Search

Use the search feature to find text across all sheets in the current project. Supports case-sensitive search and regular expressions.

### Analysis

The analysis page shows a table of character count, word count, and byte size for each sheet in a group. You can toggle whether spaces are included in the count.

### Settings

The following can be configured in Settings:

- **Theme**: Choose Default, Warm, or Cool for both light and dark mode independently
- **Typography**: Font (sans-serif, serif, monospace, system, or custom), editor and preview font size, line height, and first-line indent
  - Enabling Noto fonts provides multilingual support but requires ~50 MB download.
- **Autosave interval**: How long to wait after typing stops before saving (in seconds)
- **Markdown input rules**: Choose which markdown shorthands are active in the editor

### Keyboard Shortcuts

| Shortcut                 | Action         |
| ------------------------ | -------------- |
| `Ctrl+S` / `Cmd+S`       | Save           |
| `Ctrl+\` / `Cmd+\`       | Toggle sidebar |
| `Ctrl+Z` / `Cmd+Z`       | Undo           |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo           |
| `Ctrl+B` / `Cmd+B`       | Bold           |
| `Ctrl+I` / `Cmd+I`       | Italic         |

### Colors

Groups and sheets can be assigned a color. Colors appear in the tree and card grid to help visually distinguish items.

### Hidden Groups

Groups whose names start with `.` are treated as hidden. They remain visible in the tree but are excluded from exports by default. This is useful for storing drafts, notes, or reference material separately.

### PWA (Install as App)

Baekji supports PWA (Progressive Web App). Use your browser's "Add to Home Screen" or "Install App" option to run it as a standalone app that works offline.
