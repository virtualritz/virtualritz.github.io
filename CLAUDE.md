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
    All three current components (`admonition`, `collapse`, `marginnote`)
    unconditionally dereference `body`, so all three require the body
    form - the self-closing `{{<name .../>}}` form (valid Tera syntax for
    a component that doesn't use `body`) is not usable with any component
    currently defined in this project. Kept under `shortcodes/` only by
    convention, not because Zola looks there specifically.
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
- **Small caps**: For section headers and emphasis
- **Sidenotes**: Margin notes hoisted from Zola's own footnotes on wide screens (degrades to a plain footnote list below the breakpoint, no JS required)
- **Dark mode toggle**: Persistent theme switching, applied before first paint to avoid a flash of the wrong theme
- **Enhanced blockquotes**: With decorative quotes
- **Dotted link underlines**: Distinctive link styling

### Templates

There is a single base layout (no per-page layout variants):

- **base.html**: The site's only layout - navigation, theme toggle, footer
- **page.html**: Essay/page content, extends `base.html`
- **index.html**, **section.html**, **taxonomy_list.html**, **taxonomy_single.html**: also extend `base.html`

## Deployment

The site deploys to GitHub Pages via `.github/workflows/deploy.yml` on every push to `master`: it runs `npm test`, then `zola build`, then `zola check --skip-external-links`, then publishes the `public/` directory through the GitHub Pages Actions (not a `gh-pages` branch or manual Pages source setting).
