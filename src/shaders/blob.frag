varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vDisplacement;

uniform float time;
uniform float hueShiftSpeed;
uniform float fresnelPower;
uniform float iridescence;
uniform float opacity;
uniform vec3 baseColor; // Usually white or user defined

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 viewDir = normalize(vViewPosition); // View direction in camera space
  // Normal is already varying, but needs renormalization in frag shader
  vec3 normal = normalize(vNormal);

  // Fresnel
  // Calculate angle between view and normal
  float NdotV = dot(normal, viewDir);
  // Clamp NdotV to avoid negative values
  NdotV = clamp(NdotV, 0.0, 1.0);
  
  // Fresnel term: stronger at edges (NdotV close to 0)
  float fresnel = pow(1.0 - NdotV, fresnelPower);

  // Iridescence Color
  // Shift hue based on time and freshen/view angle
  float hue = mod(time * hueShiftSpeed + fresnel * iridescence + vDisplacement * 0.2, 1.0);
  vec3 rainbow = hsv2rgb(vec3(hue, 0.6, 1.0)); // Saturation 0.6, Value 1.0

  // Combine
  vec3 color = mix(baseColor, rainbow, fresnel * iridescence);

  gl_FragColor = vec4(color, opacity);
}
