#!/bin/sh
# Dan Posch
# Resamples all the raw textures to produce smaller textures, 
# more suitable for loading over the internet and displaying
# on small graphics cards.

SIZE=1200x600

# No antialiasing allowed for shape code textures.
# convert -sample $SIZE -colors 256 country-codes-large.png country-codes.png
# Destroys transparency. Do this manually.

# Bicubic sampling for everything else
convert -scale $SIZE earth-blank-large.png earth-blank.png
convert -scale $SIZE earth-bump-large.jpg earth-bump.jpg
convert -scale $SIZE earth-night-tex-large.jpg earth-night-tex.jpg
convert -scale $SIZE earth-tex-large.png earth-tex.png

convert -scale $SIZE moon-tex-large.jpg moon-tex.jpg
convert -scale $SIZE mars-tex-large.jpg mars-tex.jpg
convert -scale $SIZE titan-tex-large.jpg titan-tex.jpg
convert -scale $SIZE venus-tex-large.jpg venus-tex.jpg

