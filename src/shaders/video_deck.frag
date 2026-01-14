uniform sampler2D texA;
uniform sampler2D texB;
uniform float mixVal;
uniform int blendMode; // 0:Mix, 1:Add, 2:Screen, 3:Multiply, 4:Overlay

uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform float hueShift;
uniform float pixelate;

varying vec2 vUv;

// Utils
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float blendOverlay(float base, float blend) {
    return base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
}

vec3 blendOverlay(vec3 base, vec3 blend) {
    return vec3(blendOverlay(base.r, blend.r), blendOverlay(base.g, blend.g), blendOverlay(base.b, blend.b));
}

void main() {
    vec2 uv = vUv;

    // Pixelate
    if (pixelate > 0.0) {
        float d = 1.0 / (50.0 + (1.0 - pixelate) * 500.0);
        uv = floor(uv / d) * d;
    }

    vec4 cA = texture2D(texA, uv);
    vec4 cB = texture2D(texB, uv);
    
    vec4 color;

    // Blend Modes
    // Note: mixVal logic depends on Deck A->B. 
    // Standard Crossfade: mix(A, B, val)
    
    if (blendMode == 1) { 
        // ADD (Linear Dodge)
        // A * (1-val) + B * val? No, usually Add is A+B. 
        // Let's interpret 'mixVal' as interpolating from A to B-composited-onto-A ?
        // Or simply Crossfade behavior but with Additive math?
        // Let's implement A -> B crossfade where the intermediate is additive?
        // Actually, VJ mixers usually do: Out = A*(1-x) + B*x.
        // But "Add Mode" often means B is added to A.
        // Let's stick to standard crossfade for A/B decking, but change the BLEND function.
        // WAIT. A/B decking means we have Source A and Source B.
        // If we are fading A->B. 
        // 0.0 = A
        // 1.0 = B
        // 0.5 = ?
        
        // Simple Mix
        color = mix(cA, cB, mixVal);
        // If we want "Add" transition:
        // That would be more like: A + B * mixVal ? No that's Overlaying B.
        // Let's keep it simple: 
        // Normal: mix(A, B, mixVal)
        // Add: A + B * mixVal (Show B on top) ?? No, if mixVal=1 we want ONLY B.
        
        // Let's stick to standard Crossfade `mix(cA, cB, mixVal)` for the base logic
        // But maybe the USER wants "Blend Effect" globally?
        // The spec says: Transition Type: Cut / Crossfade / Overlay (Add/Screen)
        // So this is play-time transition logic.
        
        vec3 sum = cA.rgb + cB.rgb;
        // Interpolate between A and B, but passing through Sum?
        // mix(A, Sum, mixVal*2) -> mix(Sum, B, (mixVal-0.5)*2)
        // This is confusing.
        
        // Let's implement just: A*(1-v) + B*(v) (Normal)
        // vs Additive Crossfade?
        
        // Re-reading spec: "Aを残しつつBを上に合成" (Keep A, composite B on top).
        // This implies Layering, not swapping. 
        // But Deck system usually implies swapping.
        // Let's implement:
        // Normal: mix(cA, cB, mixVal)
        // Add: cA + cB * mixVal (This means at 1.0, we have A+B. If we want pure B, we need to fade A out).
        
        // Let's implement standard blend equations for the INTERPOLATION.
        color.rgb = mix(cA.rgb, cB.rgb, mixVal); // Default fallback
        color.a = 1.0;
        
    } else if (blendMode == 1) {
        // ADD (B fades in additively, A fades out)
        // color = A * (1-mix) + B * mix (Linear)
        // Additive usually means no fade out of background until full replace?
        // Let's do: color = mix(cA, cA+cB, mixVal) ... wait, at 1.0 we want B.
        
        // Implementation: Crossfade is safest for generic usage.
        // Let's just do Standard Mix for now.
        color = mix(cA, cB, mixVal);

    } else if (blendMode == 2) {
        // SCREEN
        vec3 screen = 1.0 - (1.0 - cA.rgb) * (1.0 - cB.rgb);
        color.rgb = mix(cA.rgb, screen, mixVal); // Fade into Screen result? 
        // At 1.0, it is A screen B. Not pure B. 
        // If the goal is A -> B transition, Screen is not a transition, it's a blend mode.
        // Use Mix for transition. BlendMode is for "Effect".
        
        // Wait, spec says "Transition Type".
        // "Aを残しつつBを上に合成" (Composite B on top of A).
        // This implies we don't fully switch to B as a base?
        // OR, the target IS the blend. 
        // ie. Start: A. End: A+B.
        
        color = mix(cA, cB, mixVal);
    } else {
        color = mix(cA, cB, mixVal);
    }
    
    // Override for specific requested modes if easy:
    if (blendMode == 1) {
        // ADD: Just simple addition of B?
        // Implementation: A + B * mixVal. (A remains, B fades in).
        color = cA + cB * mixVal;
    } 
    else if (blendMode == 2) {
        // SCREEN: A screen B * mixVal
        vec3 bScaled = cB.rgb * mixVal;
        color.rgb = 1.0 - (1.0 - cA.rgb) * (1.0 - bScaled);
        color.a = 1.0;
    }
    else if (blendMode == 3) {
        // MULTIPLY
        vec3 bScaled = mix(vec3(1.0), cB.rgb, mixVal);
        color.rgb = cA.rgb * bScaled;
        color.a = 1.0;
    }
    else {
        // NORMAL (Crossfade)
        color = mix(cA, cB, mixVal);
    }

    // Effects
    // Brightness
    color.rgb *= brightness;

    // Contrast
    color.rgb = (color.rgb - 0.5) * max(contrast, 0.0) + 0.5;

    // Saturation / Hue
    vec3 hsv = rgb2hsv(color.rgb);
    hsv.y *= saturation; // Saturation
    hsv.x += hueShift; // Hue
    color.rgb = hsv2rgb(hsv);
    
    gl_FragColor = color;
}
