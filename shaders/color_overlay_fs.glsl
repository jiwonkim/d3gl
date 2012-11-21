uniform sampler2D texture;    // background texture
uniform sampler2D overlay;       // country color lookup table
uniform sampler2D codes;
uniform int country;

varying vec2 vUv;

int country_code_from_color(vec3 rgb) {
    return int(rgb.r*255.*255.*255. + rgb.g*255.*255. + rgb.b*255. + 0.5);
}

bool is_highlighted() {
    if(country == 0) return false;
    int fragment_country = country_code_from_color(texture2D(codes, vUv).rgb);
    return country == fragment_country;
}

void main() {
    vec4 color = texture2D(overlay, vUv);
    vec4 texture = texture2D(texture, vUv);
    float opacity = (color.r + color.g + color.b)/3.0;
    gl_FragColor = mix(texture, color, opacity);
    if(is_highlighted()) {
        gl_FragColor = mix(gl_FragColor, vec4(1., 1., 0., 1.), 0.5);
    }
}
