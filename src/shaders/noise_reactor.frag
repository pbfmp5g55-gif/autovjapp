uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uPrevTexture;
uniform bool uFeedbackEnabled;
uniform float uFeedbackDecay;
uniform float uFeedbackSmear;

// Audio
uniform float uLow;
uniform float uMid;
uniform float uHigh;
uniform float uVol;
uniform float uOnset;

// Params
uniform int uType; // 0: flow, 1: granular, 2: interference, 3: glitch
uniform float uScale;
uniform float uDetail;
uniform float uFlowSpeed;
uniform float uWarpStrength;
uniform float uWarpScale;
uniform float uContrast;
uniform float uQuantize;

// Color
uniform int uColorMode; // 0: rainbow, 1: gradient, 2: mono
uniform float uHueShiftSpeed;
uniform float uSaturation;
uniform float uBrightness;

varying vec2 vUv;

// --- Noise Functions ---
// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// FBM
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.0;
    // Iterate based on detail. Max 6 loops for performance.
    for (int i = 0; i < 6; i++) {
        if (float(i) >= uDetail) break;
        value += amplitude * snoise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// --- Generators ---

float generateFlow(vec2 uv) {
    // Warp
    float t = uTime * uFlowSpeed;
    vec2 q = vec2(
        fbm(uv + vec2(0.0, 0.0)),
        fbm(uv + vec2(5.2, 1.3))
    );
    vec2 r = vec2(
        fbm(uv + 4.0*q + vec2(1.7, 9.2) + 0.15*t),
        fbm(uv + 4.0*q + vec2(8.3, 2.8) + 0.126*t)
    );
    
    // Audio Reactivity on Warp
    float warped = fbm(uv + uWarpScale * r + (uWarpStrength * uLow));
    return warped;
}

float generateGranular(vec2 uv) {
    // Random grains
    float noise = snoise(uv * uScale * (10.0 + uHigh * 10.0)); // High freq detail
    // Beat burst
    if (uOnset > 0.5) {
        noise += snoise(uv * 50.0) * uOnset;
    }
    return noise;
}

float generateInterference(vec2 uv) {
    float t = uTime * uFlowSpeed;
    float d = length(uv - 0.5);
    float angle = atan(uv.y - 0.5, uv.x - 0.5);
    
    float wave1 = sin(d * uScale * 20.0 - t * 5.0);
    float wave2 = cos(angle * 10.0 + d * uScale * 10.0 + t);
    
    // Warp with noise
    float n = snoise(uv * 5.0 + t);
    
    return mix(wave1 * wave2, n, uWarpStrength * uMid);
}

float generateGlitch(vec2 uv) {
    // Quantize UVs
    float blocks = 10.0 + uDetail * 20.0;
    vec2 blockUV = floor(uv * blocks) / blocks;
    
    float n = snoise(blockUV * uScale + uTime * uFlowSpeed);
    
    // Slice offset
    float slice = step(0.9, snoise(vec2(uv.y * 10.0, uTime * 20.0)));
    if (slice > 0.5 && uOnset > 0.2) {
        n = snoise((blockUV + vec2(0.1, 0.0)) * uScale);
    }
    
    return n;
}


void main() {
    float ratio = uResolution.x / uResolution.y;
    vec2 uv = vUv;
    uv.x *= ratio;
    
    // Generate Base Pattern
    float pattern = 0.0;
    
    if (uType == 0) {
        pattern = generateFlow(uv * uScale);
    } else if (uType == 1) {
        pattern = generateGranular(uv);
    } else if (uType == 2) {
        pattern = generateInterference(uv);
    } else if (uType == 3) {
        pattern = generateGlitch(uv);
    }
    
    // Map Pattern to -1..1 to 0..1
    pattern = pattern * 0.5 + 0.5;
    
    // Contrast
    pattern = (pattern - 0.5) * max(uContrast + (uVol * 0.5), 0.0) + 0.5;
    
    // Colorize
    vec3 color = vec3(0.0);
    
    if (uColorMode == 0) { // Rainbow
        // Hue based on pattern + time
        float h = fract(pattern * 0.5 + uTime * uHueShiftSpeed);
        color = hsv2rgb(vec3(h, uSaturation, pattern * uBrightness));
    } else if (uColorMode == 1) { // Gradient (Cyan/Magentaish)
        vec3 c1 = vec3(0.0, 1.0, 1.0);
        vec3 c2 = vec3(1.0, 0.0, 0.5);
        color = mix(c1, c2, pattern) * pattern * uBrightness;
    } else { // Mono
        color = vec3(pattern * uBrightness);
    }
    
    // Feedback Mixing
    if (uFeedbackEnabled) {
        // Sample previous frame with slight zoom/warp for flow
        vec2 prevUV = vUv;
        // Zoom towards center
        vec2 center = vec2(0.5);
        prevUV = (prevUV - center) * (1.0 - uFeedbackSmear * 0.01) + center;
        
        vec4 prevColor = texture2D(uPrevTexture, prevUV);
        
        // Decay
        color = mix(color, prevColor.rgb, uFeedbackDecay);
        
        // Onset Burst?
        if (uOnset > 0.8) {
             color += vec3(0.2); // flash
        }
    }
    
    // Quantize
    if (uQuantize > 0.0) {
        float steps = 4.0 + (1.0 - uQuantize) * 20.0;
        color = floor(color * steps) / steps;
    }

    gl_FragColor = vec4(color, 1.0);
}
