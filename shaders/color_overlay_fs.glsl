uniform sampler2D texBase;    // background texture
uniform sampler2D texOverlay; // canvas overlay texture
uniform sampler2D texShapes;  // shape texture. grayscale.
uniform float transparency;
// uniform sampler2D texShapeColors; // shape color -> color
//uniform vec3 opacities;       // opacities for [base texture, shape overlay, canvas overlay]
varying vec2 vUv;             // texture coordinats

void main() {
    vec4 colorBase = texture2D(texBase, vUv);
    vec4 colorShape = texture2D(texShapes, vUv);
    vec4 colorOverlay = texture2D(texOverlay, vUv);
    // TODO: lookup colorShape in a table for country shading
    //colorShape = texture2D(texShapeColors, vec2(colorShape.r, 0.0));

    gl_FragColor = mix(gl_FragColor, colorBase, 1.0);
    gl_FragColor = mix(gl_FragColor, colorShape, colorShape.a);
    gl_FragColor = mix(gl_FragColor, colorOverlay, colorOverlay.a);
    gl_FragColor.a = max(colorShape.a, max(colorOverlay.a, transparency));
}

