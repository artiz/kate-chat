# Skills

Skills let the model produce files — PowerPoint decks, PDF documents, Excel workbooks — by writing a program that runs **in the user's browser**. Nothing the model writes is executed on the server.

## How it works

1. A user enables skills for a chat in the skills menu (the wand icon) next to the model selector. Any chat model can use them; no tool-calling support is needed.
2. The API adds the enabled skills' instructions to the system prompt (`buildSkillsPrompt` in `api/src/services/skills.service.ts`).
3. When asked for a file, the model answers with one fenced block per file whose header names the skill and the file:

   ````markdown
   ```typescript skill=pptx file=quarterly-review.pptx
   import { createDeck, titleSlide } from "skill/deck.js";
   ...
   await output.save("quarterly-review.pptx", await pptx.write({ outputType: "uint8array" }));
   ```
   ````

4. When the answer is complete, the client (`SkillRuns` plugin) runs the block in a sandbox, uploads the file with the `saveGeneratedFile` mutation and shows a download card under the answer. The file is stored on S3 as a `ChatFile` of type `generated`, listed in **Library → Chat Data**, and later turns see a note that the answer produced it.
5. If the program fails, the error and its output are shown with **Ask to fix**, which sends them to the model as the next message, and **Run again**.

A block runs by itself only once: when it belongs to the chat's last answer and has no file yet. Older answers show a **Generate** button, so opening a chat never starts programs.

## Runtimes

| Runtime | Engine | Packages | Output |
| --- | --- | --- | --- |
| `typescript` | transpiled in the page, run as an ES module | npm, loaded as ESM from jsDelivr (`name@version` → `https://cdn.jsdelivr.net/npm/name@version/+esm`) | `await output.save(name, data)` with a `Uint8Array`, `ArrayBuffer`, `Blob` or string |
| `python` | [Pyodide](https://pyodide.org) 0.27 | PyPI via `micropip` (pure-Python wheels), plus Pyodide's own builds such as `lxml`, `Pillow`, `pandas`, `matplotlib` | files written to `/output/` |

The first Python run in a tab downloads the runtime (about 10 MB); later runs reuse the browser cache.

## Security

The code comes from a model, and a model's input can come from anyone: a web page it searched, an email an MCP tool read. So:

- It runs in an `<iframe sandbox="allow-scripts">` **without** `allow-same-origin`. The frame gets an opaque origin: no access to the app's `localStorage` (the JWT, MCP tokens), cookies or DOM.
- A Content-Security-Policy in the frame allows scripts and connections only to `cdn.jsdelivr.net`, `pypi.org` and `files.pythonhosted.org`, so the program cannot send data anywhere else.
- The page only accepts messages from its own frame and only file names and bytes from it. A run is stopped after 3 minutes and its files are limited to 25 MB.
- The server accepts generated files only for an assistant answer in the caller's own chat, and only with document, data or image extensions (`pptx xlsx docx pdf csv txt md json png jpg jpeg zip`). Files are served from the API's origin, so `.html`, `.svg` and `.js` are refused: opened in a browser they would run script there.
- Skills themselves ship with the deployment. They cannot be created or edited through the app; the **Skills** page (Settings → Admin → Skills, admins only) shows them read-only, exactly as the model gets them and the browser runs them.

The **Run** button on ordinary Python code blocks uses the same kind of sandbox.

## Adding a skill

Skills live in `api/resources/skills/<id>/` (override the location with `SKILLS_PATH`). The folder name is the skill id: lowercase letters, digits and dashes.

```
api/resources/skills/
  pptx/
    SKILL.md
    scripts/
      deck.js
```

`SKILL.md` starts with YAML frontmatter, followed by the instructions the model gets:

```markdown
---
name: PowerPoint presentation
description: Slide decks (.pptx) with titles, bullets, tables, charts and speaker notes.
runtime: typescript            # or python
packages:                      # npm specifiers for typescript, PyPI requirements for python
  - pptxgenjs@3.12.0
---
When to use the skill, a complete working example block with the right header, the helper API,
and the rules that keep the output valid.
```

`scripts/` is optional. Its files are available to the program:

- Python: `.py` modules, importable by name (`scripts/xlsx_helpers.py` → `import xlsx_helpers`).
- TypeScript: `.js` ES modules, importable as `"skill/<path>"` (`scripts/deck.js` → `import ... from "skill/deck.js"`). They may import the skill's packages by name.

What makes a skill work well:

- Include one complete example block. Models copy its structure, so it must run as is.
- Pin package versions.
- Put layout and styling in helpers, so the model writes content rather than coordinates.
- Say what is unavailable: there is no network and no file system to read from.

A skill that fails validation (bad frontmatter, unknown runtime, a helper file the runtime cannot use) is logged and skipped at startup; the others still load.

## Included skills

| Skill | Runtime | Library | Helper |
| --- | --- | --- | --- |
| `pptx` | TypeScript | [pptxgenjs](https://gitbrent.github.io/PptxGenJS/) | `skill/deck.js`: title, section, bullet, two-column, table (split across slides) and chart slides |
| `pdf` | TypeScript | [pdfmake](https://pdfmake.github.io/docs/) | `skill/pdf.js`: fonts covering Latin, Cyrillic and Greek, styles, tables, page numbers |
| `xlsx` | Python | [openpyxl](https://openpyxl.readthedocs.io/) | `xlsx_helpers`: styled tables with filters, number formats, column widths, charts |
