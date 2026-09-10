# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Zola (0.23.4) static website project, built from scratch with a
gwern.net-inspired typography design, and deployed to GitHub Pages at
https://virtualritz.github.io via a GitHub Actions workflow
(`.github/workflows/deploy.yml`). There is no theme; there is no git
submodule.

## Development Commands

### Build and Development

- `zola build` - Build the static site to the `public/` directory
- `zola serve` - Start development server with live reload (default: http://127.0.0.1:1111)
- `zola serve --open` - Start development server and open in browser
- `zola check` - Check for broken links and missing files

### Testing

- `npm test` - Run the test suite (`node --test tests/**/*.test.mjs`); it
  builds the site for real with `zola build` and asserts against the
  compiled output. Plain `node --test tests/` fails on Node 22 - use the
  glob form.

### Working with Content

- `zola init` - Initialize a new Zola site (only for new projects)
- Content files go in `content/` directory as Markdown files
- Static assets go in `static/` directory
- Sass files in `sass/` are automatically compiled

#### Hiding a post: `draft` vs `[extra] unlisted`

Two different things, both look like "hiding a post" but are not interchangeable:

- **`draft = true`** (front matter, top level) - the page is **not built at
  all**. It gets no output file and its URL 404s. Use this while a post is
  not ready for anyone to see it, including someone with a direct link.
  `content/essays/nsi-vs-hydra-vs-riley.md` currently uses this.
- **`[extra]` `unlisted = true`** (front matter) - the page **is built** and
  reachable at its normal URL, but is left out of everywhere the site
  advertises its contents: the homepage's recent-essays list
  (`templates/index.html`), the section listing (`templates/section.html`),
  the tag listing and tag index (`templates/taxonomy_single.html`,
  `templates/taxonomy_list.html` - a tag whose only member is unlisted is
  dropped from the tag index entirely rather than showing a `0` or a
  misleadingly-higher count), `sitemap.xml`, and the tag's Atom feed
  (`templates/atom.xml`). It also gets `<meta name="robots" content="noindex,
nofollow">` (added in `templates/base.html`) so search engines are asked
  not to index it. Use this for a post someone with the URL should be able
  to read, that should not otherwise be discoverable by browsing the site.

  **This is obscurity, not privacy.** The page is a normal, public HTML file
  with no access control - anyone who has or guesses the URL can read it,
  and it will become fully discoverable the moment it is linked from any
  page search engines do index (including, e.g., pasting the link
  somewhere public). Do not use `unlisted` for anything that needs to stay
  actually private.

  `tests/unlisted.test.mjs` pins this behaviour end-to-end against a
  temporary fixture page (written before the build, removed after).

## Project Structure

This is a Zola static site generator project with gwern.net-inspired typography:

- **config.toml** - Main configuration with site metadata, taxonomies, and markdown settings
- **content/** - Markdown content organized in sections:
  - **essays/** - Long-form writing with `_index.md` for section config
  - **projects/** - Project showcases and documentation
  - **about.md** - About page
- **templates/** - Tera templates for rendering:
  - **base.html** - Single-column base layout with navigation and the theme toggle
  - **index.html** - Homepage template
  - **page.html** - Individual page/essay template (drop caps, sidenotes, table of contents)
  - **section.html** - Section listing template
  - **taxonomy\_*.html** - Tag listing and single tag templates
  - **shortcodes/\*.html** - Tera _components_, not Zola shortcodes: Zola
    0.23 removed shortcodes entirely in favour of Tera components, which
    are global once parsed regardless of which file defines them. Defined
    with `{% component name(...) %}...{% endcomponent name %}`; invoked
    from content with a body as `{% <name arg="val"> %}body{% </name> %}`.
    All four current components (`admonition`, `collapse`, `marginnote`,
    `dek`) unconditionally dereference `body`, so all four require the
    body form - the self-closing `{{<name .../>}}` form (valid Tera
    syntax for a component that doesn't use `body`) is not usable with
    any component currently defined in this project. Kept under
    `shortcodes/` only by convention, not because Zola looks there
    specifically.
    - **dek** - a short lead-in set above an essay's standfirst (e.g. a one-line "TL;DR:"), used in `content/essays/nsi-vs-hydra-vs-riley.md`. It exists to solve a layout bug, not a copy-editing preference: `dropcaps.js` places the drop cap on the first paragraph that is a direct child of `.article-body`, and places no cap at all if that paragraph is too short to host the cap's full depth. A bare "TL;DR:" line is exactly that too-short paragraph - left as a plain paragraph, it (not the standfirst below it) becomes the direct-child paragraph the cap tries and fails to attach to, silently losing the drop cap for the whole essay. `dek` wraps its body in its own container element, so the paragraph it renders is a descendant of `.article-body` rather than a direct child, and the direct-child selector skips over it and lands on the standfirst instead, which fits the cap. Do not simplify a `dek` back into a plain paragraph - that reintroduces the missing-drop-cap regression (previously "fixed", then reverted, at commits `ab45802`/`9951ceb`/`acab0ba`, by teaching the cap itself to walk forward to a paragraph that fits; that approach broke justif's text-wrap around the cap and was reverted in favour of this content-side fix). `tests/components.test.mjs` asserts the invariant that must never regress: the essay's first direct-child paragraph of `.article-body` is the standfirst, never the TL;DR.
- **sass/** - Stylesheet partials (`_tokens.scss` design tokens, `_typography.scss`,
  `_layout.scss`, `_components.scss`, etc.), assembled by `style.scss` and compiled
  by Zola
- **static/** - Static assets (images, JS, CSS) copied directly to output

## Important Configuration

The site is configured with:

- Base URL: https://virtualritz.github.io
- Sass compilation: Enabled
- Smart punctuation: Enabled (converts straight quotes to curly, -- to en dash, --- to em dash)
- Syntax highlighting: Not yet configured (base16-ocean-light, the previous choice, no longer exists in Zola 0.23)
- External links: Open in new tab
- Taxonomies: Tags with RSS feed support

## Typography Features

The site implements advanced gwern.net-inspired typography:

### Typefaces

- **EB Garamond** for body text (with Apple Garamond/Baskerville/Times New Roman fallbacks)
- **Source Sans 3** for UI elements and metadata
- **IBM Plex Mono** for code blocks
- **IM Fell English** and **Thunder VF** (a variable-weight display face) for drop caps

### Advanced Features

- **Smart punctuation**: Automatic curly quotes, em/en dashes
- **Drop caps**: Ink-measured, stroke-width-matched ornamental first letters for essays
- **Small caps**: For section headers and emphasis. Either `<span class="small-caps">foo</span>`, or `****foo****` — pulldown-cmark parses four asterisks either side as nested `<strong><strong>`, and `sass/_typography.scss`'s `.article-body strong strong` rule gives that `font-variant: small-caps` with the bold reset to normal weight.
- **Sidenotes**: Margin notes hoisted from Zola's own footnotes on wide screens (degrades to a plain footnote list below the breakpoint, no JS required)
- **Dark mode toggle**: Persistent theme switching, applied before first paint to avoid a flash of the wrong theme
- **Enhanced blockquotes**: With decorative quotes
- **Dotted link underlines**: Distinctive link styling

### Paragraph breaks: two styles, chosen in the source

A paragraph break renders one of two ways, and the markdown source picks
which:

- **Blank line** (a normal new paragraph) → an empty line of vertical
  space, flush left. This is the default for every `<p>` and needs no
  special authoring; it is a deliberate break between thoughts.
- **A single newline, with no blank line** (a plain line wrap in the
  source — CommonMark's "soft break" — OR an explicit hard break: end a
  line with a backslash `\` or two trailing spaces, which CommonMark
  renders as `<br>`) → the following line is indented 2.5em with **no**
  vertical gap — continuous prose, book style. Both spellings render
  identically; write whichever is convenient. This means **prose must not
  be hard-wrapped** unless every wrap is meant to become an indent — see
  `content/essays/typography.md` and `content/about.md`, which are kept
  unwrapped (one paragraph per source line) for exactly this reason.

Mechanically: `sass/_typography.scss` gives every `<p>` `text-indent: 0`
and puts the gap on `p + p` (one line-height). The indent comes from a
`.para-indent` marker span (`display: inline-block; width: 2.5em`)
inserted at runtime by `static/js/mark-para-indent.js` (pure logic in
`static/js/lib/para-indent.js`) right after every hard break, AND after
every plain newline it finds inside an `.article-body` `<p>` (skipping a
newline right at the start or end of the paragraph, or one that would
straddle a blank line) — `text-indent` can't do this alone, because
`each-line` would also indent the paragraph's own first line, which the
flush-break case forbids, and a `::before`/`::after` on `<br>` itself does
not render in any browser tested.

**No-JS degradation, and it is not the same for the two spellings:**

- A **hard break** (`\` or two trailing spaces) is server-rendered by
  Zola as a real `<br>`, so the line break always happens. Only the
  indent is JS-dependent; without it, the continuation reads as a flush
  line directly under the one above, with no visual distinction from a
  wrapped line.
- A **soft break** (plain newline, no backslash) is not turned into a
  `<br>` by Zola at all — it stays a literal newline character inside the
  `<p>`'s text, and default CSS whitespace handling renders that as an
  ordinary space. Without JS there is no break and no indent: the two
  source lines simply read as one continuous, wrapped sentence. Nothing
  disappears and no text is lost — the site remains fully readable with
  JS off, it just loses the indent/gap distinction between paragraph
  styles.

### Templates

There is a single base layout (no per-page layout variants):

- **base.html**: The site's only layout - navigation, theme toggle, footer
- **page.html**: Essay/page content, extends `base.html`
- **index.html**, **section.html**, **taxonomy_list.html**, **taxonomy_single.html**: also extend `base.html`

## Deployment

The site deploys to GitHub Pages via `.github/workflows/deploy.yml` on every push to `master`: it runs `npm test`, then `zola build`, then `zola check --skip-external-links`, then publishes the `public/` directory through the GitHub Pages Actions (not a `gh-pages` branch or manual Pages source setting).
