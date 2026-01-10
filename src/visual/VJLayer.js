import * as THREE from 'three';

export class VJLayer {
    constructor(index, total, role) {
        this.index = index;
        this.total = total;
        this.role = role; // 'Low', 'Mid', 'High', 'Beat', 'Ambient'

        this.group = new THREE.Group();
        this.mesh = null;
        this.material = null;
        this.geometry = null;

        this.baseScale = 1.0;
        this.rotationSpeed = { x: Math.random() * 0.01, y: Math.random() * 0.01, z: Math.random() * 0.01 };

        // State Management
        this.isActive = false;
        this.isDisappearing = false;
        this.disappearType = null; // 'fade', 'shrink', 'suck'
        this.animationProgress = 0; // 0 to 1

        this.originalPosition = new THREE.Vector3(); // Store the layout position

        this.init();

        // Start hidden
        this.group.visible = false;
        this.group.scale.set(0, 0, 0);
    }

    init() {
        // Diverse Geometry Selection
        // All must be high-poly enough for vertex displacement morphing
        const geomTypes = [
            // 0: Sphere-ish (Organic)
            () => new THREE.IcosahedronGeometry(1, 4),
            // 1: Box (Digital/Glitchy) - Subdivided
            () => new THREE.BoxGeometry(1.2, 1.2, 1.2, 8, 8, 8),
            // 2: Cone (Sharp/Aggressive) - Subdivided
            () => new THREE.ConeGeometry(0.8, 1.5, 32, 8),
            // 3: TorusKnot (Complex/Alien)
            () => new THREE.TorusKnotGeometry(0.6, 0.2, 100, 16),
            // 4: Cylinder (Tubular/Industrial)
            () => new THREE.CylinderGeometry(0.5, 0.5, 2.0, 32, 8),
            // 5: Ring/Torus (Portal-like)
            () => new THREE.TorusGeometry(0.8, 0.3, 16, 50)
        ];

        // Select based on index to ensure deterministic variety across the 30 layers
        const geomFactory = geomTypes[this.index % geomTypes.length];
        this.baseGeometry = geomFactory();

        this.geometry = this.baseGeometry.clone();

        // Store original positions for restoration/morphing reference
        this.originalPositions = this.geometry.attributes.position.array.slice();

        this.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(this.index / this.total, 0.8, 0.5),
            wireframe: false,
            transparent: true,
            opacity: 0.8,
            emissive: new THREE.Color().setHSL(this.index / this.total, 0.8, 0.2),
            emissiveIntensity: 1.0,
            side: THREE.DoubleSide,
            flatShading: true // Enhanced look when deformed
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.group.add(this.mesh);
    }

    setPosition(x, y, z) {
        this.group.position.set(x, y, z);
        this.originalPosition.set(x, y, z);
    }

    spawn() {
        if (this.isActive && !this.isDisappearing) return; // Already active

        this.isActive = true;
        this.isDisappearing = false;
        this.group.visible = true;

        // Reset properties
        this.group.scale.set(0.01, 0.01, 0.01); // Start small
        this.material.opacity = 0;
        this.animationProgress = 0;

        // Reset position to original (in case sucked away)
        this.group.position.copy(this.originalPosition);

        // Randomize rotation on spawn
        this.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    }

    disappear(type) {
        if (!this.isActive || this.isDisappearing) return;

        this.isDisappearing = true;
        this.disappearType = type;
        this.animationProgress = 0;
    }

    update(audio, midi, globalMidi) {
        // If completely inactive and hidden, do nothing
        if (!this.isActive && !this.group.visible) return;

        const intensity = globalMidi ? globalMidi.cc1 : 1.0;
        const hueOffset = globalMidi ? globalMidi.cc2 : 0;

        // --- Real-time Morphing (Vertex Displacement) ---

        const positions = this.geometry.attributes.position;
        const count = positions.count;
        const time = performance.now() * 0.002;

        // Calculate Deform Factors based on Audio
        const spikeAmount = (audio.high * 1.5 * intensity) + (audio.beat * 0.5);
        const wobbleAmount = audio.mid * 0.5;

        // Apply Displacement
        for (let i = 0; i < count; i++) {
            const ox = this.originalPositions[i * 3];
            const oy = this.originalPositions[i * 3 + 1];
            const oz = this.originalPositions[i * 3 + 2];

            // Reconstruct normal vector
            const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
            const nx = ox / len;
            const ny = oy / len;
            const nz = oz / len;

            // Noise-like pattern
            const noise = Math.sin(nx * 10 + time) * Math.cos(ny * 10 + time) * Math.sin(nz * 10 + time);

            // Target Displacement
            let displacement = 0;
            // High Freq -> Spikes
            if (spikeAmount > 0.05) {
                displacement += noise * spikeAmount;
            }
            // Mid Freq -> Wobble
            if (wobbleAmount > 0.05) {
                displacement += Math.sin(time * 3 + ny * 5) * wobbleAmount * 0.2;
            }

            // Apply scale
            const scale = 1 + displacement;
            positions.setXYZ(i, ox * scale, oy * scale, oz * scale);
        }

        positions.needsUpdate = true;
        this.geometry.computeVertexNormals();

        // --- Lifecycle Animation Logic ---
        const lerpFactor = 0.1;

        if (this.isActive && !this.isDisappearing) {
            // Spawning / Active Phase
            this.material.opacity = THREE.MathUtils.lerp(this.material.opacity, 0.8, 0.05);

            let reactionVal = 0;
            if (this.role === 'Low') reactionVal = audio.low;
            else if (this.role === 'Mid') reactionVal = audio.mid;
            else if (this.role === 'High') reactionVal = audio.high;
            else if (this.role === 'Beat') reactionVal = audio.beat;
            else reactionVal = audio.rms;

            let roleScaleEffect = 0;
            if (this.role === 'Beat') roleScaleEffect = reactionVal * 1.5 * intensity + 0.2;
            else roleScaleEffect = reactionVal * 0.5 * intensity;

            const targetScale = this.baseScale * (1.0 + roleScaleEffect);
            this.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), lerpFactor);

            if (this.role === 'Mid') this.mesh.rotation.x += reactionVal * 0.1 * intensity;
            if (this.role === 'High') this.material.emissiveIntensity = 0.5 + reactionVal * 2.0 * intensity;
            if (this.role === 'Ambient') this.group.rotation.z += 0.01;

        } else if (this.isDisappearing) {
            this.animationProgress += 0.02;
            if (this.disappearType === 'fade') {
                this.material.opacity = THREE.MathUtils.lerp(this.material.opacity, 0, 0.1);
                if (this.material.opacity < 0.05) this.finalizeDeath();
            }
            else if (this.disappearType === 'shrink') {
                this.group.scale.lerp(new THREE.Vector3(0, 0, 0), 0.15);
                if (this.group.scale.length() < 0.05) this.finalizeDeath();
            }
            else if (this.disappearType === 'suck') {
                this.group.position.z -= 0.5;
                this.group.scale.lerp(new THREE.Vector3(0, 0, 0), 0.1);
                if (this.group.position.z < (this.originalPosition.z - 20) || this.group.scale.length() < 0.05) this.finalizeDeath();
            }
        }

        // --- Common Physics/Visuals ---
        this.mesh.rotation.x += this.rotationSpeed.x;
        this.mesh.rotation.y += this.rotationSpeed.y;

        // MIDI Hue Application
        const h = (this.index / this.total + hueOffset) % 1.0;
        this.material.color.setHSL(h, 0.8, 0.5);
        if (!this.isDisappearing || this.disappearType !== 'fade') {
            this.material.emissive.setHSL(h, 0.8, 0.3);
            if (audio.beat > 0.8) {
                this.material.emissiveIntensity = 2.0;
            } else {
                if (this.role !== 'High') this.material.emissiveIntensity = THREE.MathUtils.lerp(this.material.emissiveIntensity, 0.2, 0.1);
            }
        } else {
            this.material.emissiveIntensity = 0;
        }
    }

    finalizeDeath() {
        this.isActive = false;
        this.isDisappearing = false;
        this.group.visible = false;
        this.group.scale.set(0, 0, 0);
    }

    setWireframe(state) {
        this.material.wireframe = state;
    }
}
