# PBFF Glyph Remover

GitHub Pages-ready glyph remover for TTF and OTF fonts.

## Files

- index.html
- app.js
- style.css
- logo.png
- README.md

Replace `logo.png` with your own logo. Keep the filename exactly `logo.png`.

## Important changes

1. Pyodide/fontTools is NOT loaded when the page opens.
2. Upload and glyph preview therefore start much faster.
3. The file picker is opened only from the Choose Font button.
4. Logo is circular.
5. Glyph preview uses high-resolution canvas and the real glyph outline bounding box.
6. Each glyph is mathematically centered inside the preview box.
7. Clicking a glyph marks/unmarks it for removal.
8. Glyph #0 (.notdef) cannot be removed.
9. Download processing uses fontTools subsetter with OpenType layout features enabled.
10. Downloaded filename starts with `PBFF_` and ends with `_Removed`.

Example:
`PBFF_MyFont_Removed.ttf`

The first Download operation needs an internet connection because Pyodide and fontTools are loaded in the browser.
