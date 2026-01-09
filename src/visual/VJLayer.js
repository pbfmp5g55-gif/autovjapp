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

        this.init();
    }

    init() {
        const geometries = [
            new THREE.IcosahedronGeometry(1, 0),
            new THREE.TorusKnotGeometry(0.7, 0.2, 64, 8),
            new THREE.SphereGeometry(1, 32, 32),
            new THREE.BoxGeometry(1.5, 1.5, 1.5),
            new THREE.OctahedronGeometry(1.2, 0)
        ];

        this.geometry = geometries[this.index % geometries.length];

        this.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(this.index / this.total, 0.8, 0.5),
            wireframe: false,
            transparent: true,
            opacity: 0.8,
            emissive: new THREE.Color().setHSL(this.index / this.total, 0.8, 0.2),
            emissiveIntensity: 1.0
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.group.add(this.mesh);

        // Initial position
        this.group.position.z = -this.index * 2;
    }

    update(audio, midi, globalMidi) {
        const intensity = globalMidi.cc1; // CC1: Total Intensity
        const hueOffset = globalMidi.cc2; // CC2: Hue Offset
        const deformAmount = globalMidi.cc4; // CC4: Deform

        // Role based reaction
        let reactionVal = 0;
        switch (this.role) {
            case 'Low':
                reactionVal = audio.low;
                this.baseScale = 1.0 + reactionVal * 0.5 * intensity;
                break;
            case 'Mid':
                reactionVal = audio.mid;
                // Mid reacts with vertex jitter/rotation
                this.mesh.rotation.x += reactionVal * 0.05 * intensity;
                break;
            case 'High':
                reactionVal = audio.high;
                this.material.emissiveIntensity = 0.5 + reactionVal * 2.0 * intensity;
                break;
            case 'Beat':
                reactionVal = audio.beat;
                const s = 1.0 + reactionVal * 1.5 * intensity;
                this.group.scale.set(s, s, s);
                break;
            case 'Ambient':
                reactionVal = audio.rms;
                this.group.rotation.z += 0.005;
                break;
        }

        // Common movements
        this.mesh.rotation.x += this.rotationSpeed.x;
        this.mesh.rotation.y += this.rotationSpeed.y;

        // MIDI Hue
        const h = (this.index / this.total + hueOffset) % 1.0;
        this.material.color.setHSL(h, 0.8, 0.5);
        this.material.emissive.setHSL(h, 0.8, 0.3);

        // Apply global intensity to scale
        const targetScale = this.baseScale * (0.5 + intensity * 0.5);
        this.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }

    setWireframe(state) {
        this.material.wireframe = state;
    }
}
