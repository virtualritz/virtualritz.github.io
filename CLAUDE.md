# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Zola-based static website project configured to be deployed to GitHub Pages at https://virtualritz.github.com. The project uses the Blowfish theme as a git submodule.

## Development Commands

### Build and Development
- `zola build` - Build the static site to the `public/` directory
- `zola serve` - Start development server with live reload (default: http://127.0.0.1:1111)
- `zola serve --open` - Start development server and open in browser
- `zola check` - Check for broken links and missing files

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
  - **base.html** - Base layout with navigation
  - **index.html** - Homepage template
  - **page.html** - Individual page template
  - **section.html** - Section listing template
  - **taxonomy_*.html** - Tag listing and single tag templates
- **sass/style.scss** - Main stylesheet with gwern.net-inspired typography using Source Serif 4
- **static/** - Static assets (images, JS, CSS) copied directly to output

## Important Configuration

The site is configured with:
- Base URL: https://virtualritz.github.io
- Sass compilation: Enabled
- Smart punctuation: Enabled (converts straight quotes to curly, -- to en dash, --- to em dash)
- Syntax highlighting: Enabled with base16-ocean-light theme
- External links: Open in new tab
- Taxonomies: Tags with RSS feed support

## Typography Features

The site implements advanced gwern.net-inspired typography:

### Typefaces
- **Source Serif 4** for body text (multiple weights)
- **Source Sans 3** for UI elements and metadata
- **IBM Plex Mono** for code blocks
- **Cinzel Decorative** for drop caps

### Advanced Features
- **Smart punctuation**: Automatic curly quotes, em/en dashes
- **Drop caps**: Ornamental first letters for essays
- **Small caps**: For section headers and emphasis
- **Sidenotes**: Margin notes on wide screens (degrades gracefully)
- **Section numbering**: Automatic hierarchical numbering
- **Three-column layout**: Navigation, content, and sidenotes
- **Dark mode toggle**: Persistent theme switching
- **Backlinks**: Support for bidirectional linking
- **Enhanced blockquotes**: With decorative quotes
- **Dotted link underlines**: Distinctive link styling

### Templates
- **base.html**: Standard single-column layout
- **base-gwern.html**: Three-column layout with sidebars
- **page-gwern.html**: Essay template with all typography features
- Use `template = "page-gwern.html"` in frontmatter for full features

## Deployment

The site is configured for GitHub Pages deployment. The build output goes to the `public/` directory which should be configured as the source for GitHub Pages.