# Baekji (백지)

**A minimal, local-first writing tool for any device.**

> _백지 (baekji)_ means "blank paper" in Korean.

**Live app**: https://lumiknit.github.io/apps/baekji

**Guide**: [English](docs/GUIDE.md) · [한국어](docs/GUIDE.ko.md)

---

## Features

- **Local-first** — all data lives in your browser's IndexedDB; no account or server needed
- **Project → Group → Sheet** hierarchy for organizing writing
- **Markdown editor** with live preview — write Markdown directly, rendered as you type
- **Export** — combine sheets into a single Markdown, HTML, or plain-text file; share or download
- **Backup & restore** — export/import a full project as a single `.json` file
- **Search** — full-text search across all sheets in a project, with regex support
- **Analysis** — per-sheet character, word, and byte counts
- **Theming** — light/dark mode with Default, Warm, and Cool variants
- **Customizable typography** — font family, size, line height, indentation
- **PWA support** — install as a standalone offline app on desktop or mobile

## How to Build

**Prerequisites**: [Bun](https://bun.sh/) (or Node.js)

```bash
git clone https://github.com/lumiknit/baekji.git
cd baekji
bun install
```

```bash
# Development server
bun run dev

# Production build (output: dist/)
bun run build
```

---

## License

Mozilla Public License 2.0 — see [LICENSE](LICENSE).

Created by **lumiknit** (<aasr4r4@gmail.com>)
