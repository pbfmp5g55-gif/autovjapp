uniform float time;
uniform float intensity;
varying vec2 vUv;
varying vec3 vNormal;

// HSV to RGB function
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    // Simple rainbow gradient based on UV and Time
    // p.x + p.y for diagonal gradient
    float hue = fract(vUv.x * 0.5 + vUv.y * 0.5 + time * 0.1);
    
    // Saturation and Value
    float sat = 0.4 + 0.2 * sin(time * 0.5);
    float val = 0.8 + 0.2 * intensity; // Reacts to audio
    
    vec3 color = hsv2rgb(vec3(hue, sat, val));
    
    // Add subtle noise or pattern? keeping it clean for "Holo" feel.
    
    gl_FragColor = vec4(color, 1.0);
}
