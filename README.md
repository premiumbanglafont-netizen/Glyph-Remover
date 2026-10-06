# PBFF Glyph Remover
GitHub Pages-ready TTF/OTF glyph remover.

Files:
- index.html
- app.js
- style.css
- logo.png
- README.md

Important fix: the previous version did not include the Pyodide loader, so Download could not start. This version includes it and enables Download after a valid font is loaded.

Replace logo.png with your own logo, keeping the same filename.

Output filename:
PBFF_FontName_Removed.ttf
or
PBFF_FontName_Removed.otf

The first download requires an internet connection because Pyodide and fontTools load in the browser.
