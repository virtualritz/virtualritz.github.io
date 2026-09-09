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
