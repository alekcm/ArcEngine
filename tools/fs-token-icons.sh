#!/bin/sh
# Extract the front faces from the supplied scans. Requires ImageMagick (convert).
# Keep the originals intact; transparent masks remove the other face and scan labels.
set -eu
cd "$(dirname "$0")/.."
out=assets/fs-icons
mkdir -p "$out"
order() {
    convert "$1" -crop 290x258+4+204 +repage \
        \( -size 290x258 xc:none -fill white -draw 'polygon 73,0 217,0 289,128 217,257 73,257 0,128' \) \
        -alpha off -compose CopyOpacity -composite -resize 192x192 "$out/order-$2.png"
}
asset() {
    convert "$1" -crop "$2" +repage \
        \( -size "$3" xc:none -fill white -draw "$4" \) \
        -alpha off -compose CopyOpacity -composite -resize 160x160 "$out/asset-$5.png"
}
order Warhammer/9B8AAA799BC9DF79EB48D2167D68866B6B904DDB_2.jpg strategize
order Warhammer/CC651EC6D590E0F79AB4FC289C8BCA24180FF3E8_4.jpg advance
order Warhammer/хз.png deploy
order Warhammer/хз2.png dominate
asset Warhammer/AssetCache.jpg 258x258+33+12 258x258 'circle 129,129 129,1' cache
asset Warhammer/AssetForge.jpg 258x258+33+12 258x258 'circle 129,129 129,1' forge
asset Warhammer/AssetReinforcement.jpg 289x289+0+0 289x289 'circle 144,144 144,1' reinforcement
