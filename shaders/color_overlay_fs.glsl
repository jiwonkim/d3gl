uniform sampler2D texture;    // background texture
uniform sampler2D overlay;       // country color lookup table

varying vec2 vUv;

void main() {
    vec4 color = texture2D(overlay, vUv);
    vec4 texture = texture2D(texture, vUv);
    float opacity = (color.r + color.g + color.b)/3.0;
    gl_FragColor = mix(texture, color, opacity);
}
