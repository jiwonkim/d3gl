#!/bin/bash
gcc tools/jsmin.c -o tools/jsmin
rm -f js/d3gl.min.js
cat js/jquery-1.8.2.js \
    js/jquery.mousewheel.js \
    js/d3.v2.js \
    js/three.js \
    js/RequestAnimationFrame.js \
    js/d3gl.js \
    | ./tools/jsmin > js/d3gl.min.js

markdown < README.md > README.html
