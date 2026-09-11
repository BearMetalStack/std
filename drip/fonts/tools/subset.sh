#!/usr/bin/env bash
# Regenerates drip/fonts/assets/**/*.woff2 from upstream font builds.
#
# Drip self-hosts a pared-down slice of each family: Latin (Basic + Latin-1 +
# Extended-A/B), punctuation, currency, arrows, maths operators, box-drawing and
# block/geometric shapes. The private-use icon glyphs that make the Nerd Font
# builds ~2.5 MB each, and Greek/Cyrillic, are dropped. Comfortaa stays a
# variable font (wght 300-700); Monofur ships Regular/Bold/Italic.
#
# Requires `pyftsubset` (fonttools) and `woff2`. With uv:
#   uvx --from 'fonttools[woff]' pyftsubset ...
#
# Point these at your local copies of the source fonts:
#   MONOFUR_DIR - dir holding MonofurNerdFont-{Regular,Bold,Italic}.ttf
#                 (github.com/ryanoasis/nerd-fonts, "Monofur" — the base build,
#                  not -Mono or -Propo; the icon glyphs get stripped anyway)
#   COMFORTAA_VF - path to Comfortaa[wght].ttf / Comfortaa_VariableFont_wght.ttf
#                 (fonts.google.com/specimen/Comfortaa)
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
MONOFUR_DIR="${MONOFUR_DIR:-/usr/share/fonts/TTF}"
COMFORTAA_VF="${COMFORTAA_VF:-$HOME/.local/share/fonts/Comfortaa[wght].ttf}"

pyftsubset() { uvx --from 'fonttools[woff]' pyftsubset "$@"; }

# Latin + punctuation + symbols + box-drawing/blocks/shapes. No Greek/Cyrillic.
MONO_RANGES="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0180-024F,U+2000-206F,U+2070-209F,U+20A0-20BF,U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,U+2500-257F,U+2580-259F,U+25A0-25FF"
# Comfortaa carries no box-drawing; it is the body font, so keep IPA + combining marks.
SANS_RANGES="U+0020-007E,U+00A0-024F,U+0250-02AF,U+02B0-02FF,U+0300-036F,U+2000-206F,U+2070-209F,U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2212,U+FB00-FB04"

for weight in Regular Bold Italic; do
	pyftsubset "$MONOFUR_DIR/MonofurNerdFont-$weight.ttf" \
		--unicodes="$MONO_RANGES" --layout-features='*' --no-hinting \
		--flavor=woff2 --output-file="$here/assets/monofur/Monofur-$weight.woff2"
done

pyftsubset "$COMFORTAA_VF" \
	--unicodes="$SANS_RANGES" --layout-features='*' --no-hinting \
	--flavor=woff2 --output-file="$here/assets/comfortaa/Comfortaa.woff2"

echo "Subset done. Now run: deno task bm:fonts"
