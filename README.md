# PBFF Glyph Remover

GitHub Pages-ready browser font glyph remover.

## Files

- `index.html`
- `app.js`
- `style.css`
- `logo.png` ← put your own logo here

## Upload to GitHub

1. Create/open your repository.
2. Upload all files in this folder.
3. Put your logo beside `index.html` and name it exactly `logo.png`.
4. Enable GitHub Pages from repository Settings → Pages.
5. Open the published Pages URL.

## Processing

The app uses Pyodide in the browser and Python fontTools for font subsetting. `opentype.js` is used only for glyph inspection/preview. The output name is:

`PBFF_OriginalFontName_Removed.ttf`

or

`PBFF_OriginalFontName_Removed.otf`

The subsetter keeps OpenType layout features enabled. For complex scripts such as Bangla, layout-dependent glyphs may be retained when required for shaping. This is safer than rebuilding a font from a bare glyph list.

The app needs an internet connection on first load because Pyodide, fontTools, and opentype.js are loaded from CDNs. No font file is uploaded to your server by this app.
