uniform sampler2D texBase;    // background texture
uniform sampler2D texOverlay; // canvas overlay texture

uniform sampler2D texShapes;  // shape texture. grayscale.
uniform sampler2D texColorLookup; // shape color -> color
uniform int lookupShapes;

//uniform vec3 opacities;       // opacities for [base texture, shape overlay, canvas overlay]
varying vec2 vUv;             // texture coordinats

int colorToShapeId(vec3 rgb) {
    // first put rgb into [0, 255] scale
    float r = clamp(rgb.r * 256., 0., 255.);
    float g = clamp(rgb.g * 256., 0., 255.);
    float b = clamp(rgb.b * 256., 0., 255.);
    
    float divisor = 25.5;
    int dr = int(r/divisor + 0.5);
    int dg = int(g/divisor + 0.5);
    int db = int(b/divisor + 0.5);
    return dr*10*10 + dg*10 + db;
   /* 
    int dr = int(rgb.r*10. + 0.5);
    int dg = int(rgb.g*10. + 0.5);
    int db = int(rgb.b*10. + 0.5);
    return dr*10*10 + dg+10 + db;
*/
}

void main() {
    if(lookupShapes==1) {
        vec4 shapeColor = texture2D(texShapes, vUv);
        int id = colorToShapeId(shapeColor.rgb);
        vec4 color = texture2D(texColorLookup, vec2(float(id)/1024., 0.));
        gl_FragColor = vec4(color.rgb, 1.);
        return;
    }
    vec4 colorBase = texture2D(texBase, vUv);
    vec4 colorShape = texture2D(texShapes, vUv);
    vec4 colorOverlay = texture2D(texOverlay, vUv);
    // TODO: lookup colorShape in a table for country shading
    //colorShape = texture2D(texShapeColors, vec2(colorShape.r, 0.0));

    gl_FragColor = mix(gl_FragColor, colorBase, colorBase.a);
    gl_FragColor = mix(gl_FragColor, colorShape, colorShape.a);
    gl_FragColor = mix(gl_FragColor, colorOverlay, colorOverlay.a);
}

