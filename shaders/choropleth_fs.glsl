uniform sampler2D texture;    // background texture
uniform sampler2D choropleth;       // country color lookup table

varying vec2 vUv;

void main() {
    vec4 overlay = texture2D(choropleth, vUv);
    vec4 texture = texture2D(texture, vUv);
    float opacity = (overlay.r + overlay.g + overlay.b)/3.0;
    gl_FragColor = mix(texture, overlay, opacity);
}
