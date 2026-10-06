# PBFF Glyph Remover FIX 2

This build fixes the main reason some selected glyphs were coming back after download.

Previous behavior:
- `layout_closure=True` could re-add glyphs referenced by GSUB/GPOS.
- `recommended_glyphs=True` could automatically add early glyph IDs.
- Therefore the UI could show a glyph as selected, but the downloaded font could still contain it.

This build uses:
- `layout_closure=False`
- `recommended_glyphs=False`
- `notdef_glyph=True`
- GSUB/GPOS/GDEF tables are still subsetted to the remaining glyph set.

Important:
A glyph can still be required as a component of another glyph. For example, a composite glyph may reference another glyph as an outline component. Removing the component while keeping the composite would require changing/decomposing the composite outline. The tool therefore prioritizes a valid font and Bangla shaping rather than creating broken outlines.

Files:
index.html
app.js
style.css
logo.png
README.md

Replace logo.png with your own logo.
