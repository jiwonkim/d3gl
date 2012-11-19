// texture coordinate for vertex to be interpolated and passed into
// fragment shader per fragment
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
}
