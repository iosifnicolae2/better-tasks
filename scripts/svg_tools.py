"""Rich draws a terminal window around an exported SVG: rounded frame, three dots, a title bar. For the README
we only want the terminal itself, so this trims that off.

The title bar is 32px of the 40px Rich leaves above the content; the frame rect keeps the background colour, so
it stays — shortened, moved up, and with its corners kept.
"""
from __future__ import annotations

import re

TITLE_BAR = 32   # what Rich reserves above the terminal for the dots and the title


def strip_chrome(svg: str) -> str:
    svg = re.sub(r'\s*<circle[^>]*/>', "", svg)                       # the three dots
    svg = re.sub(r'\s*<text[^>]*-title[^>]*>.*?</text>', "", svg, flags=re.S)
    svg = re.sub(r'\s*<g transform="translate\(26,22\)">\s*</g>', "", svg)   # what held them

    def shorter(match: re.Match) -> str:
        return f'{match.group(1)}{float(match.group(2)) - TITLE_BAR}{match.group(3)}'

    svg = re.sub(r'(viewBox="0 0 [\d.]+ )([\d.]+)(")', shorter, svg, count=1)          # the page
    svg = re.sub(r'(<rect fill="[^"]*" stroke[^>]*height=")([\d.]+)(")', shorter, svg, count=1)   # the frame
    # and everything inside it moves up by the same amount
    svg = re.sub(r'<g transform="translate\((\d+), (\d+)\)" clip-path',
                 lambda m: f'<g transform="translate({m.group(1)}, {int(m.group(2)) - TITLE_BAR})" clip-path', svg)
    return svg


def save(svg: str, path) -> None:
    path.write_text(strip_chrome(svg))
