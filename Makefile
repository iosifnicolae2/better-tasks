.PHONY: install uninstall screenshots

install:   ## install the supermanager / sm commands, linked to this checkout
	./install.sh

uninstall:
	uv tool uninstall supermanager

screenshots:   ## redraw docs/screenshots from the real pages
	uv run --with textual --with tomli-w --with typer --with rich --with mcp python scripts/screenshots.py
