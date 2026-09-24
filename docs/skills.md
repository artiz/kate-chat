# Skills

Skills let the model produce files — PowerPoint decks, PDF documents, Excel workbooks — by writing a program that runs **in the user's browser**. Nothing the model writes is executed on the server.

## How it works

1. Every skill is available to every chat model, and the model decides which one a request needs; the user does not pick skills. The message details list the skills an answer used.
2. The API (`withSkills` in `api/src/services/skills.service.ts`) adds a short catalog to the system prompt: each skill's id, name and description, and the rules for skill blocks. A model that can call tools (every model with MCP support) loads a skill's full instructions with the built-in `use_skill` tool (`api/src/services/ai/tools/skills.tool.ts`) before writing its block; the result also lists the chat's files and, for TypeScript skills, the photo API. A model without tool calls gets every skill's instructions in the prompt instead. After `use_skill`, the rest of the answer is not limited by the chat's **Max Tokens**: a program cut off in the middle produces no file, and continuing it only starts a new block, so it gets the model's own output limit. The message keeps a one-line summary of the tool result, not the instructions.
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

In the chat, an answer with a skill block is about the file, not the code: its code blocks start collapsed (the client sets `collapseCodeBlocks` on the message; click the header to expand), and a copy of the "files attached" note that a model sometimes writes into its own answer is removed, both from what the chat shows and from the history the model gets.

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
- A Content-Security-Policy in the frame allows scripts only from `cdn.jsdelivr.net`, and connections only to the package hosts (`cdn.jsdelivr.net`, `pypi.org`, `files.pythonhosted.org`) and the photo hosts (`commons.wikimedia.org`, `upload.wikimedia.org`, `thumb.wikimedia.org`, `images.unsplash.com`). A program can send a request there (a photo search is one), but not to a server whose logs an attacker could read.
- Chat files reach a program only when it names them: the client downloads the `/files/<this chat>/...` paths the program mentions (at most 20 files, 30 MB), with the user's session, and hands their bytes to the frame, which cannot reach the app itself.
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
- TypeScript: `.js` ES modules, importable as `"skill/<path>"` (`scripts/deck.js` → `import ... from "skill/deck.js"`). They may import the skill's packages by name. Their exports are also set as globals before the program runs, so a helper the model uses but forgets to import still works.

What makes a skill work well:

- Include one complete example block. Models copy its structure, so it must run as is.
- Pin package versions.
- Put layout and styling in helpers, so the model writes content rather than coordinates.
- Say what is unavailable: there is no network and no file system to read from.
- Make helpers forgiving about what models get wrong. `renderPdf`, for example, maps a font it does not have (Arial, Comic Sans MS) to the closest one it has and logs a warning instead of failing.

A skill that fails validation (bad frontmatter, unknown runtime, a helper file the runtime cannot use) is logged and skipped at startup; the others still load.

## Included skills

| Skill | Runtime | Library | Helper |
| --- | --- | --- | --- |
| `pptx` | TypeScript | [pptxgenjs](https://gitbrent.github.io/PptxGenJS/) | `skill/deck.js`: title, section, bullet, two-column, table (split across slides) and chart slides |
| `pdf` | TypeScript | [pdfmake](https://pdfmake.github.io/docs/) | `skill/pdf.js`: six fonts covering Latin and Cyrillic (loaded on demand), page colour, styles, tables, page numbers |
| `xlsx` | Python | [openpyxl](https://openpyxl.readthedocs.io/) | `xlsx_helpers`: styled tables with filters, number formats, column widths, charts |
| `office-edit` | Python | [python-pptx](https://python-pptx.readthedocs.io/), [python-docx](https://python-docx.readthedocs.io/), openpyxl | `office_helpers`: changes a docx, pptx or xlsx of the chat and saves the new version: text replacement that keeps formatting, duplicate/move/delete slides, fonts, colours, slide backgrounds |

## Chat files

Programs can read the files of their chat: images, documents the user attached and files earlier answers made. The prompt lists the chat's latest 30 by path (`/files/<chatId>/...`), with how each got there. A Python program finds each file at that very path (`Presentation("/files/...")`), a TypeScript one gets its bytes with `await files.load("/files/...")`. So "add a slide to this deck" or "make the headings blue in the report I sent" works: the `office-edit` skill opens the file, changes it and saves the new version, which the chat shows like any generated file.

Word, PowerPoint and Excel files (docx, pptx, xlsx) attached to a message are chat documents for every chat model: the API extracts their text (`api/src/utils/office.ts`: headings, paragraphs and tables, slides in order with their notes, each sheet as rows with formulas) and sends that to the model, since providers accept few of these formats (Bedrock no pptx, OpenAI none). The file itself stays with the message, in the Library and for skills. Old binary formats (doc, ppt, xls) still go to RAG.

## Photos

TypeScript programs get a global `images`, and the pptx and pdf helpers accept its results or any source it takes:

- `await images.search(query, { count })` searches Wikimedia Commons and returns exactly `count` photos: `{ data, width, height, title, credit, placeholder }`, where `data` is a data URL and `credit` is the author and licence. Missing results (nothing found, rate limits) are grey stand-ins with `placeholder: true`, so a program never gets `undefined`.
- `await images.load(src)` takes an image of the chat (`/files/<key>`, listed in the prompt), `"commons:<file name>"`, or an https URL on Unsplash or Wikimedia.
- Photos larger than 2000 px, or in a format other than PNG or JPEG, are scaled and re-encoded in the frame.
- `deck.js` has `imageSlide`, `addImage` and a photo behind `titleSlide`. A photo that cannot be loaded becomes a grey placeholder with a warning in the run's output, and Commons photos get their credit line. `renderPdf` loads `image:` values itself.

The prompt lists the chat's latest 20 images for chats with a TypeScript skill. Python programs cannot use `images`.

### PDF fonts

`renderPdf` has six fonts. All are Google Fonts with Latin and Cyrillic, with regular, bold, italic and bold italic (Caveat has no italic, so italic text is set upright). Roboto ships with pdfmake; the others are static TTFs from [`@expo-google-fonts`](https://github.com/expo/google-fonts) on jsDelivr, downloaded only when a document uses them (about 0.1–0.35 MB per style).

| Font | Kind | Good for |
| --- | --- | --- |
| Roboto | sans-serif | the default: body text, tables |
| PT Serif | serif | body text of letters, reports, long reads |
| Montserrat | geometric sans-serif | headings, titles, posters |
| Playfair Display | display serif | elegant headings, invitations, covers |
| Roboto Mono | monospace | code, figures in columns |
| Caveat | handwritten | notes, informal touches; it runs small, so use 14 pt or more |

A document picks a font with `font` on a text node, a style or `defaultStyle`:

```typescript
const bytes = await renderPdf({
  defaultStyle: { font: "PT Serif" },
  styles: { h1: { font: "Montserrat", fontSize: 18, bold: true } },
  pageColor: "#FFF8E1",
  content: [{ text: "Invitation", font: "Playfair Display", fontSize: 28 }, "..."],
});
```

Models often ask for fonts they know from office software, so those map to the closest available one, with a warning in the run's output:

| Asked for | Gets |
| --- | --- |
| Arial, Helvetica, Calibri, Verdana, Open Sans, Inter, `sans-serif`, any unknown font | Roboto |
| Times New Roman, Georgia, Garamond, Cambria, `serif` | PT Serif |
| Futura, Gotham, Avenir, Poppins | Montserrat |
| Didot, Bodoni | Playfair Display |
| Courier New, Consolas, Menlo, `monospace` | Roboto Mono |
| Comic Sans MS, `cursive` | Caveat |

`pageColor` (or `backgroundColor`, which models tend to guess) fills every page with a colour. To add a font, put it in `EXTRA_FONTS` in `api/resources/skills/pdf/scripts/pdf.js` (a package that serves static TTFs, with Cyrillic) and list it in the skill's `SKILL.md`.
