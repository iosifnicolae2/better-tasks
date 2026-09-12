.PHONY: install uninstall screenshots

install:   ## install the supermanager / sm commands, linked to this checkout
	./install.sh

uninstall:
	uv tool uninstall supermanager

RUN = uv run --with textual --with tomli-w --with typer --with rich --with mcp python

screenshots:   ## redraw docs/screenshots: the pages, and the walkthrough
	$(RUN) scripts/screenshots.py
	$(RUN) scripts/walkthrough.py
