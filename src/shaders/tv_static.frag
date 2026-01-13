uniform float uTime;
uniform vec2 uResolution;

// Audio
uniform float uVol;   // Volume RMS (Amount, Contrast)
uniform float uLow;   // Low band (Grain size)
uniform float uHigh;  // High band (Flicker)
uniform float uOnset; // Beat Onset (Glitch/Jitter)

// Params
uniform float uAmount;
uniform float uContrast;
uniform float uGrainSize;
uniform float uFlickerSpeed;
uniform float uScanlines;    // 0..1
uniform float uHorizontalJitter; // 0..1
uniform float uVignette;     // 0..1
uniform bool uMono;

varying vec2 vUv;

// Hash function for pseudo-random noise
float hash12(vec2 p) {
	vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 uv = vUv;
    float time = uTime;
    
    // 1. Horizontal Jitter (Glitch)
    // Triggered by Onset or constant Jitter param
    float jitterStrength = uHorizontalJitter * 0.05 + (uOnset * 0.05 * uHorizontalJitter); // Dynamic jitter
    if (jitterStrength > 0.0) {
        // Simple wave offset
        float jitter = sin(uv.y * 50.0 + time * 20.0) * jitterStrength;
        // Random twitch
        if (hash12(vec2(time, 0.0)) > 0.9) jitter += (hash12(vec2(time, uv.y)) - 0.5) * 0.1 * uOnset;
        uv.x += jitter;
    }

    // 2. Grain / Noise Generation
    // Dynamic Grain Size: Base + Audio Low
    float currentGrain = max(0.5, uGrainSize + uLow * 2.0);
    vec2 seed = floor(uv * uResolution / currentGrain);
    
    // Time variation for flicker
    // uHigh increases speed
    float t = time * (uFlickerSpeed + uHigh * 5.0);
    float noise = hash12(seed + t);

    // 3. Contrast & Amount
    // Audio Volume affects Amount (density) or visibility?
    // Spec: Audio missing -> keep Amount (Silent Idle). With Audio -> Increase.
    // Let's mix Base Amount with Audio Volume
    float activeAmount = clamp(uAmount + uVol * 0.5, 0.0, 1.0);
    float activeContrast = clamp(uContrast + uVol * 0.5, 0.0, 2.0);
    
    // Apply contrast: (val - 0.5) * contrast + 0.5
    noise = (noise - 0.5) * activeContrast + 0.5;
    
    // Mask by Amount? 
    // Usually static is additive or overlay.
    // If Amount is 0, screen is black? Or noise is invisible?
    // Let's map Amount to simple brightness scaler for now.
    noise *= activeAmount;

    // 4. Scanlines
    // scanline pattern: sine wave
    float sl = 1.0;
    if (uScanlines > 0.0) {
        float scanCount = uResolution.y * 0.3; // moderate lines
        float s = sin(uv.y * scanCount + time * 0.5); // moving slowly
        s = s * 0.5 + 0.5;
        // uScanlines controls strength: 0=no effect, 1=full modulation
        sl = mix(1.0, s, uScanlines);
    }
    
    // Apply Scanline
    noise *= sl;

    // 5. Color Mode
    vec3 col = vec3(noise);
    if (!uMono) {
        // RGB Noise: generate distinct hash for each channel
        float r = hash12(seed + t);
        float g = hash12(seed + t + 13.5);
        float b = hash12(seed + t + 27.1);
        
        vec3 rgb = vec3(r,g,b);
        rgb = (rgb - 0.5) * activeContrast + 0.5;
        rgb *= activeAmount * sl;
        
        col = rgb;
    }

    // 6. Vignette
    if (uVignette > 0.0) {
        float d = length(vUv - 0.5); // use original vUv for vignette
        float v = 1.0 - smoothstep(0.4, 0.8, d * (1.0 + uVignette * 0.5));
        col *= v;
    }
    
    // 7. Base Black Level (Optional)
    // To keep "TV look", maybe not pitch black.
    // Spec says "Silent Idle: Audio missing -> thin".
    // Handled by activeAmount logic slightly.
    
    gl_FragColor = vec4(col, 1.0);
}
