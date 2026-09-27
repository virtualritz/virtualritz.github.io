# Build the site
build:
    zola build

# Serve with live reload
serve:
    zola serve --open

# Unit and build tests
test:
    npm test

# Regenerate self-hosted fonts (needs python3 + fontTools)
fonts:
    python3 build/fonts.py

# Everything CI runs, plus `fonts` (which CI does not run)
check: fonts build test
    zola check --skip-external-links

# Title-case frontmatter titles and headings, in place. CSS cannot do this:
# `text-transform: capitalize` raises every word, so "a note on the word
# RenderMan" would become "A Note On The Word RenderMan". Which words stay
# down is a dictionary question, so it is settled once, in the source.
format:
    node build/titlecase.mjs content

# Format, run everything, then push — GitHub Actions deploys on push to
# master. It stops rather than pushing if `format` changed content, because
# a reformatted title is an edit to your writing and should be read before
# it ships, not swept into a deploy.
publish: format check
    @git diff --quiet -- content || { echo; echo "content was reformatted above — review and commit it, then re-run"; exit 1; }
    git push origin master
