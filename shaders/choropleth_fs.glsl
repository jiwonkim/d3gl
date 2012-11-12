uniform sampler2D texture;    // background texture
uniform sampler2D countries;  // country codes as colors
uniform sampler2D data;       // country color lookup table

varying vec2 vUv;

int color_to_country(vec3 rgb) {
    int r = int(256.*rgb.r);
    int g = int(256.*rgb.g);
    int b = int(256.*rgb.b);
    return r*256*256 + g*256 + b;
}

void main() {
    vec4 country = texture2D(countries, vUv);
    vec4 bg_texture = texture2D(texture, vUv);
    if(country.r==0. && country.g==0. && country.b==0.) {
        gl_FragColor = bg_texture;
        return;
    }
    
    int country_code = color_to_country(country.rgb);
    
    if(country_code==0) {
        gl_FragColor = bg_texture;
        return;
    }

    vec2 dataUv = vec2(float(country_code)/1024., 0);
    vec4 color_overlay = texture2D(data, dataUv);
    gl_FragColor = color_overlay;
}
