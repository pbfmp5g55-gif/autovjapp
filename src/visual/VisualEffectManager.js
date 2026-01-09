import * as THREE from 'three';

export class VisualEffectManager {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.currentMode = 'Normal';

        this.init();
    }

    init() {
        // We'll use a simple post-processing setup if possible, 
        // but for high performance and "generative/noise" feel, 
        // we can also use custom materials or screen-space effects.

        // Setup a full-screen quad for post-effects
        this.fsQuadScene = new THREE.Scene();
        this.fsQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

        this.effectMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                time: { value: 0 },
                vMode: { value: 0 }, // 0: 3D, 1: Noise, 2: Composite
                subMode: { value: 0 }, // 0: Normal, 1: Kaleidoscope, 2: OpArt
                intensity: { value: 1.0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                audioLow: { value: 0 },
                audioMid: { value: 0 },
                audioHigh: { value: 0 },
                audioBeat: { value: 0 },
                modeParam: { value: 0 },  // CC5
                subParam: { value: 0.5 }  // CC6
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform int vMode;
                uniform int subMode;
                uniform float intensity;
                uniform vec2 resolution;
                uniform float audioLow;
                uniform float audioMid;
                uniform float audioHigh;
                uniform float audioBeat;
                uniform float modeParam;   // CC5: Mode Switch
                uniform float subParam;    // CC6: Sub Parameter
                
                varying vec2 vUv;

                // ===== Noise Functions =====
                
                // Hash function for noise
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }
                
                // Improved noise (Perlin-like)
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f); // Smoothstep
                    
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
                
                // Fractal Brownian Motion (FBM) for multi-scale noise
                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    
                    for(int i = 0; i < 4; i++) {
                        value += amplitude * noise(p * frequency);
                        frequency *= 2.0;
                        amplitude *= 0.5;
                    }
                    return value;
                }

                // ===== Kaleidoscope Functions =====
                
                vec2 kaleidoscope(vec2 uv, float sides, float rotation) {
                    vec2 p = uv - 0.5;
                    float r = length(p);
                    float a = atan(p.y, p.x) + rotation;
                    float tau = 6.283185307179586;
                    
                    // Mirror the angle
                    a = mod(a, tau / sides);
                    a = abs(a - tau / sides / 2.0);
                    
                    return 0.5 + r * vec2(cos(a), sin(a));
                }
                
                vec2 mirror(vec2 uv, int type) {
                    vec2 p = uv - 0.5;
                    
                    if (type == 1) { // X Mirror
                        p.x = abs(p.x);
                    } else if (type == 2) { // Y Mirror
                        p.y = abs(p.y);
                    } else if (type == 3) { // XY Mirror
                        p = abs(p);
                    } else if (type == 4) { // Radial Mirror
                        float a = atan(p.y, p.x);
                        a = abs(mod(a, 1.5708) - 0.7854); // 4-way radial
                        float r = length(p);
                        p = r * vec2(cos(a), sin(a));
                    }
                    
                    return p + 0.5;
                }

                // ===== Glitch Effects =====
                
                vec3 rgbShift(sampler2D tex, vec2 uv, float amount) {
                    float r = texture2D(tex, uv + vec2(amount, 0.0)).r;
                    float g = texture2D(tex, uv).g;
                    float b = texture2D(tex, uv - vec2(amount, 0.0)).b;
                    return vec3(r, g, b);
                }
                
                vec2 glitchDistortion(vec2 uv, float amount) {
                    float glitchLine = step(0.98, hash(vec2(floor(uv.y * 100.0), floor(time * 5.0))));
                    if (glitchLine > 0.5) {
                        uv.x += (hash(vec2(uv.y, time)) - 0.5) * amount;
                    }
                    return uv;
                }

                // ===== Op Art / Moiré Functions =====
                
                float opArtPattern(vec2 uv, float freq1, float freq2, float phase) {
                    float p1 = sin(uv.x * freq1 + phase + sin(uv.y * 5.0));
                    float p2 = sin(uv.y * freq2 - phase + cos(uv.x * 5.0));
                    return p1 * p2;
                }
                
                float moirePattern(vec2 uv, float scale, float rotation) {
                    vec2 center = uv - 0.5;
                    float angle = atan(center.y, center.x);
                    float radius = length(center);
                    
                    float pattern1 = sin(radius * scale);
                    float pattern2 = sin((radius + rotation * 0.1) * (scale + 1.0));
                    
                    return pattern1 * pattern2;
                }

                void main() {
                    vec2 uv = vUv;
                    
                    // Determine active mode based on CC5 (modeParam)
                    int activeMode = 0; // 0: Noise, 1: Kaleidoscope, 2: OpArt
                    if (modeParam < 0.33) {
                        activeMode = 0; // Noise/Glitch
                    } else if (modeParam < 0.66) {
                        activeMode = 1; // Kaleidoscope/Mirror
                    } else {
                        activeMode = 2; // OpArt/Moiré
                    }
                    
                    // Also allow subMode to override (for UI control)
                    if (subMode == 1) activeMode = 1;
                    if (subMode == 2) activeMode = 2;
                    
                    // ===== NOISE / GLITCH MODE =====
                    if (activeMode == 0) {
                        // Apply glitch distortion (reacts to high frequencies)
                        float glitchAmount = audioHigh * intensity * 0.1;
                        uv = glitchDistortion(uv, glitchAmount);
                        
                        // RGB Shift
                        vec3 color;
                        if (vMode == 0) { // 3D with glitch
                            float shiftAmount = audioHigh * intensity * 0.01;
                            color = rgbShift(tDiffuse, uv, shiftAmount);
                        } else {
                            color = texture2D(tDiffuse, uv).rgb;
                        }
                        
                        // Generate noise
                        vec2 noiseUv = uv * (100.0 + subParam * 200.0);
                        noiseUv.x += sin(uv.y * 10.0 + time * 2.0) * 5.0;
                        noiseUv.y += cos(uv.x * 10.0 - time * 2.0) * 5.0;
                        
                        float n = fbm(noiseUv * 0.01 + time * 0.5);
                        float fineNoise = hash(uv * 500.0 + time);
                        
                        // TV static effect
                        float grain = mix(n, fineNoise, audioHigh);
                        float noiseIntensity = intensity * (0.5 + audioHigh * 0.5);
                        float threshold = 0.5 - noiseIntensity * 0.3;
                        float noiseVal = step(threshold, grain);
                        
                        // Scanlines
                        float scanline = sin(uv.y * 800.0 + time * 10.0) * 0.5 + 0.5;
                        scanline = smoothstep(0.3, 0.7, scanline);
                        
                        // Block noise
                        vec2 blockUv = floor(uv * (10.0 + audioHigh * 40.0)) / (10.0 + audioHigh * 40.0);
                        float blockNoise = hash(blockUv + time * 0.1);
                        
                        vec3 noiseColor = vec3(noiseVal);
                        noiseColor *= scanline * 0.5 + 0.5;
                        noiseColor = mix(noiseColor, vec3(blockNoise), audioHigh * 0.3);
                        
                        // Digital glitch lines
                        float glitchLines = step(0.98, hash(vec2(uv.y * 100.0, time * 5.0)));
                        if (glitchLines > 0.5) {
                            noiseColor = 1.0 - noiseColor;
                        }
                        
                        // Mix based on vMode
                        if (vMode == 1) { // Pure Noise
                            gl_FragColor = vec4(noiseColor, 1.0);
                        } else if (vMode == 2) { // Composite
                            gl_FragColor = vec4(mix(color, noiseColor, 0.5 * intensity), 1.0);
                        } else { // 3D with effects
                            gl_FragColor = vec4(mix(color, noiseColor, audioHigh * intensity * 0.5), 1.0);
                        }
                    }
                    
                    // ===== KALEIDOSCOPE / MIRROR MODE =====
                    else if (activeMode == 1) {
                        // Dynamic divisions based on CC6 and audio
                        float divisionBase = 4.0 + subParam * 12.0; // 4 to 16 divisions
                        float divisions = divisionBase + audioLow * 4.0;
                        
                        // Rotation based on mid frequencies
                        float rotation = time * 0.5 + audioMid * 3.14159;
                        
                        // Apply kaleidoscope
                        vec2 kUv = kaleidoscope(uv, divisions, rotation);
                        
                        // Additional mirror effects
                        if (subParam > 0.5) {
                            kUv = mirror(kUv, 3); // XY Mirror
                        }
                        
                        vec4 texColor = texture2D(tDiffuse, kUv);
                        
                        // Add radial patterns
                        vec2 center = uv - 0.5;
                        float radius = length(center);
                        float radialPulse = sin(radius * 20.0 - time * 2.0 + audioLow * 10.0);
                        radialPulse = radialPulse * 0.5 + 0.5;
                        
                        // Color modulation
                        vec3 color = texColor.rgb;
                        color *= (0.7 + radialPulse * 0.3);
                        color *= (1.0 + audioMid * intensity);
                        
                        gl_FragColor = vec4(color, 1.0);
                    }
                    
                    // ===== OP ART / MOIRÉ MODE =====
                    else if (activeMode == 2) {
                        // Get base texture
                        vec4 texColor = texture2D(tDiffuse, uv);
                        
                        // Op Art parameters driven by beat and CC6
                        float freq1 = 50.0 + subParam * 100.0 + audioBeat * 50.0;
                        float freq2 = 50.0 + (1.0 - subParam) * 100.0 + audioBeat * 50.0;
                        float phase = time * 3.0;
                        
                        // Generate Op Art pattern
                        float pattern = opArtPattern(uv, freq1, freq2, phase);
                        
                        // Moiré interference
                        float moire = moirePattern(uv, 30.0 + audioBeat * 20.0, time);
                        
                        // Combine patterns
                        float combined = pattern * 0.6 + moire * 0.4;
                        combined = combined > 0.0 ? 1.0 : 0.0; // High contrast
                        
                        // Add visual tricks (phase shift creates optical illusion)
                        float phaseShift = sin(uv.x * 10.0 + time) * sin(uv.y * 10.0 - time);
                        combined = mix(combined, 1.0 - combined, phaseShift * 0.2);
                        
                        vec3 opColor = vec3(combined);
                        
                        // BPM synchronization - pulse effect
                        float pulse = audioBeat;
                        opColor *= (0.8 + pulse * 0.4);
                        
                        // Mix with 3D scene
                        if (vMode == 0) { // 3D overlay
                            gl_FragColor = vec4(mix(texColor.rgb, opColor, intensity * 0.7), 1.0);
                        } else if (vMode == 1) { // Pure pattern
                            gl_FragColor = vec4(opColor, 1.0);
                        } else { // Composite
                            gl_FragColor = vec4(mix(texColor.rgb, opColor, 0.5 * intensity), 1.0);
                        }
                    }
                }
            `
        });

        this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.effectMaterial);
        this.fsQuadScene.add(this.fsQuad);
    }

    setVMode(modeStr) {
        const mapping = { '3D': 0, 'Noise': 1, 'Composite': 2 };
        this.effectMaterial.uniforms.vMode.value = mapping[modeStr] ?? 0;
    }

    setSubMode(modeStr) {
        const mapping = { 'Normal': 0, 'Kaleidoscope': 1, 'OpArt': 2 };
        this.effectMaterial.uniforms.subMode.value = mapping[modeStr] ?? 0;
    }

    onResize() {
        this.renderTarget.setSize(window.innerWidth, window.innerHeight);
        this.effectMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }

    render(audio, midi) {
        this.effectMaterial.uniforms.time.value += 0.01 + (audio.beat * 0.1);
        this.effectMaterial.uniforms.intensity.value = midi.cc1;

        // Pass audio data to shader
        this.effectMaterial.uniforms.audioLow.value = audio.low;
        this.effectMaterial.uniforms.audioMid.value = audio.mid;
        this.effectMaterial.uniforms.audioHigh.value = audio.high;
        this.effectMaterial.uniforms.audioBeat.value = audio.beat;

        // Pass MIDI CC5 and CC6 - Now purely extra params, NOT mode switchers if manually set
        // We keep them for parameter tweaks within the mode
        this.effectMaterial.uniforms.modeParam.value = 0; // Force 0 to let subMode control the main switch
        this.effectMaterial.uniforms.subParam.value = midi.cc4; // Use CC4 as subParam for more control

        // Always render with effects for generative visuals
        // Render scene to target
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);

        // Render target to screen with effect
        this.renderer.setRenderTarget(null);
        this.effectMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
        this.renderer.render(this.fsQuadScene, this.fsQuadCamera);
    }
}
