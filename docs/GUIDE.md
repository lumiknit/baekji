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

The sidebar can be opened and closed with the button in the top-left corner.

At the top of the sidebar you can switch between the **project list** and the **sheet list** of the current project.

### Projects

From the project list you can create a new project or import an existing backup file (`.json`).

Projects are fully independent and do not affect each other.

**Backup**: All project data can be exported as a single `.json` file. To use Baekji across multiple devices, export this file to a cloud storage service and import it on each device.

### Sheet List

The sheet list shows all sheets in the current project as a scrollable linear list.

- Sheets can be **reordered** by dragging them.
- Use the **tag filter** at the top to filter sheets by tags. Only sheets matching all specified tags are shown.
- Multiple sheets can be selected for bulk operations (e.g. delete).
- Deleted sheets go to the **Trash** section at the bottom of the list. You can restore them or empty the trash permanently.

### Tags

Each sheet can have one or more tags assigned. Tags are used to filter and organize sheets within a project.

- To add or edit tags on a sheet, use the `...` menu on the sheet item and select **Tags**.
- In the tag filter input, type a tag name to narrow the sheet list to matching sheets.

### Sheets

A sheet is equivalent to a file in other applications. Sheets have no explicit title — the first line of the content is used as the display name.

The editor is a **plain Markdown editor with live preview**. There is no toolbar for formatting — you write Markdown directly and the editor renders it as you type:

- `# ` → Heading 1, `## ` → Heading 2, `### ` → Heading 3
- `- ` or `* ` → Bullet list, `1. ` → Numbered list
- `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``
- `> ` → Blockquote, ` ``` ` → Code block

The top-right overlay shows a character count and save status. The **`...`** button there opens a menu for Save, Split (split at cursor into two sheets), and Analysis.

When you reopen a sheet, the cursor is restored to where you left off.

**Autosave**: The sheet is saved automatically after a short idle period. To save manually, press `Ctrl+S` (macOS: `Cmd+S`).

### Search

Use the search feature to find text across all sheets in the current project. Supports case-sensitive search and regular expressions.

### Settings

The following can be configured in Settings:

- **Theme**: Choose Default, Warm, or Cool for both light and dark mode independently
- **Typography**: Font (sans-serif, serif, monospace, system, or custom), editor and preview font size, line height, and first-line indent
  - Enabling Noto fonts provides multilingual support but requires max 30 MB download.
- **Autosave interval**: How long to wait after typing stops before saving (in seconds)
- **Markdown input rules**: Choose which markdown shorthands are active in the editor

### Keyboard Shortcuts

| Shortcut                 | Action |
| ------------------------ | ------ |
| `Ctrl+S` / `Cmd+S`       | Save   |
| `Ctrl+Z` / `Cmd+Z`       | Undo   |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo   |

### PWA (Install as App)

Baekji supports PWA (Progressive Web App). Use your browser's "Add to Home Screen" or "Install App" option to run it as a standalone app that works offline.
