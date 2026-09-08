+++
title = "Design of This Website"
date = 2024-01-25
description = "Meta page describing this website's implementation using gwern.net-inspired typography and design principles"
template = "page-gwern.html"

[taxonomies]
tags = ["design", "typography", "web", "minimalism"]

[extra]
epistemic_status = "Highly confident about design principles; experimental on implementation details"
backlinks = [
    {title = "Typography Demo", url = "/essays/typography-demo/"},
    {title = "About", url = "/about/"}
]
related = [
    {title = "On Digital Writing", url = "/essays/example-essay/", description = "Exploring digital text evolution"}
]
+++

This page describes the self-documenting website's implementation: a semantic zoom of hypertext, technical decisions using Markdown, and certainly highly likely typographic details inspired by gwern.net.

## Design Principles

There are 4 design principles:

1. **Aesthetically-pleasing Minimalism**<span class="sidenote">The design aesthetic reflects a belief that minimalism---when done right---helps one focus on the content. Everything beyond the content is distraction and dilution.</span>
   
   The design esthetic is minimal, with a dash of Art Nouveau. I believe that minimalism helps one focus on the content. "Attention" as [Edward Tufte](https://www.edwardtufte.com/) would say.

2. **Typography First**
   
   The website is deliberately kept grayscale as an experiment in consistency and whether this constraint permits a readable & appealing visual design. Typography and small caps<span class="sidenote">Small caps are used for emphasis and section headers throughout, providing visual hierarchy without shouting.</span> are used for theming or emphasis.

3. **Progressive Enhancement**
   
   Universal features include: the monochrome esthetics, sidenotes instead of footnotes on wide windows, efficient drop-caps, automatic inflation-adjustment currency, and an ecosystem of "popups"/<span class="popup-link">popins<span class="popup-content">Popins are inline expansions that reveal additional content without leaving the page</span></span>/link icons.

4. **Performance & Accessibility**
   
   No JavaScript required for core functionality. Semantic HTML throughout. Fast load times through minimal dependencies.

## Typography Details

### Typefaces

The site uses a carefully selected typeface stack:

- **Source Serif 4** for body text---a transitional serif optimized for screen reading
- **Source Sans 3** for UI elements and metadata---humanist proportions for clarity
- **IBM Plex Mono** for code blocks---distinguishable characters for programming

### Smart Punctuation

The site enables smart punctuation throughout. Notice how "quotes become curly", apostrophes in contractions like don't and it's are properly styled, and dashes---both em and en--are automatically converted.

### Drop Caps

Each major section begins with an ornamental drop cap<span class="sidenote">Drop caps, or "initial letters", are a traditional book design element dating back to illuminated manuscripts.</span>, adding visual interest and marking clear entry points into the text.

## Technical Implementation

The site is built with [Zola](https://www.getzola.org/), a fast static site generator written in Rust. Key technical decisions:

```toml
# Core configuration
base_url = "https://virtualritz.github.io"
compile_sass = true
smart_punctuation = true

[markdown]
highlight_code = true
highlight_theme = "base16-ocean-light"
external_links_target_blank = true
```

### Layout Structure

The three-column layout provides:
1. **Left sidebar**: Navigation and table of contents
2. **Center column**: Main content (optimal 65-75 character line length)
3. **Right sidebar**: Sidenotes and marginalia<span class="sidenote">On smaller screens, sidenotes gracefully degrade to inline expandable notes.</span>

## Inspiration & Attribution

This design is heavily inspired by [gwern.net](https://gwern.net), which pioneered many of these typographic techniques for the modern web. Gwern Branwen's site demonstrates that web typography can rival---and in some ways exceed---print typography.

Other influences include:
- Edward Tufte's principles of information design
- Matthew Butterick's [Practical Typography](https://practicaltypography.com/)
- The classical book design tradition

## Future Improvements

Planned enhancements include:

- Full-text search with keyboard navigation
- Automatic link previews on hover
- Citation management with BibTeX support
- Dark/light theme persistence across sessions
- Print stylesheet optimizations

The source code for this site is available on [GitHub](https://github.com/virtualritz/virtualritz.github.io).