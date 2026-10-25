# Fonts

Outfit is self-hosted under the SIL Open Font License 1.1 in
`outfit/LICENSE.txt`. The Latin and Latin Extended WOFF2 subsets come from
Fontsource's Outfit distribution; upstream: https://github.com/Outfitio/Outfit-Fonts.

`/rer-theme.css` declares the self-hosted faces (Outfit, Bitter, Figtree and
Caveat, plus their local metric fallbacks) so the installer serves them too.
`/fonts/fonts.css` carries the page font, Purse's own tokens and its shared page
rules. Documents link both files; the run site and root document preload the
Latin Figtree and Bitter files. Do not import this CSS from a component.

Fallback scales use Outfit/Arial advance-width ratios over A-Z, a-z and 0-9
at weights 400, 500 and 700. Ascent, descent and line gap match Outfit's
1000, -260 and 0 per 1000 units, divided by each scale. Matching metrics reduces
layout movement; different glyph designs cannot have identical widths in every
piece of text. Recalculate the fallback and preload when changing the brand font.
