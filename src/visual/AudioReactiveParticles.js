import * as THREE from 'three';

export class AudioReactiveParticles {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.lines = [];

        this.isActive = false;

        // Cooldowns to prevent too many objects
        this.beatCooldown = 0;
        this.lineCooldown = 0;

        // Materials
        this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
        this.tetraGeo = new THREE.TetrahedronGeometry(1);
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 1
        });

        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 1,
            linewidth: 2
        });
    }

    setVisible(visible) {
        this.isActive = visible;
        if (!visible) this.clearAll();
    }

    clearAll() {
        // Remove all objects
        for (const p of this.particles) this.scene.remove(p.mesh);
        for (const l of this.lines) this.scene.remove(l.mesh);
        this.particles = [];
        this.lines = [];
    }

    update(audio, midi) {
        if (!this.isActive) return;

        const dt = 0.016; // Approx delta time

        // --- 1. Spawn Logic ---

        // Beat Spawn (Objects)
        if (this.beatCooldown > 0) this.beatCooldown -= dt;
        if (audio.beat > 0.6 && this.beatCooldown <= 0) {
            this.spawnObject(midi);
            this.beatCooldown = 0.2 + (1.0 - midi.cc1) * 0.3; // CC1 controls density (speed)
        }

        // High Freq Spawn (Lines)
        if (this.lineCooldown > 0) this.lineCooldown -= dt;
        if (audio.high > 0.5 && this.lineCooldown <= 0) {
            this.spawnLine(midi);
            this.lineCooldown = 0.1 + (1.0 - midi.cc1) * 0.2;
        }

        // --- 2. Update Particles ---

        // Update Objects
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt * (0.5 + midi.cc3); // CC3: Decay speed

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }

            // Animation
            p.mesh.position.add(p.velocity);
            p.mesh.rotation.x += p.rotVel.x;
            p.mesh.rotation.y += p.rotVel.y;
            p.mesh.scale.multiplyScalar(0.98); // Shrink
            p.mesh.material.opacity = p.life;
        }

        // Update Lines
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const l = this.lines[i];
            l.life -= dt * (1.0 + midi.cc3);

            if (l.life <= 0) {
                this.scene.remove(l.mesh);
                this.lines.splice(i, 1);
                continue;
            }

            l.mesh.scale.x += 0.5; // Stretch
            l.mesh.material.opacity = l.life;
            l.mesh.rotation.z += 0.05;
        }
    }

    spawnObject(midi) {
        const geo = Math.random() > 0.5 ? this.boxGeo : this.tetraGeo;
        const color = new THREE.Color().setHSL(midi.cc2 + Math.random() * 0.1, 1, 0.5);

        const mat = this.material.clone();
        mat.color = color;
        mat.wireframe = Math.random() > 0.3; // Mix wire and solid

        const mesh = new THREE.Mesh(geo, mat);

        // Random start pos near center
        mesh.position.set(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 2
        );

        // Explode outward
        const velocity = mesh.position.clone().normalize().multiplyScalar(0.2 + midi.cc4 * 0.5);

        const size = 1 + Math.random() * 2;
        mesh.scale.set(size, size, size);

        this.scene.add(mesh);

        this.particles.push({
            mesh: mesh,
            velocity: velocity,
            rotVel: { x: Math.random() * 0.1, y: Math.random() * 0.1 },
            life: 1.0 // 1 second base life
        });
    }

    spawnLine(midi) {
        // Create a long thin line
        const geometry = new THREE.BufferGeometry();
        // A simple line segment
        const limit = 20;
        const x1 = (Math.random() - 0.5) * limit;
        const y1 = (Math.random() - 0.5) * limit;
        const z = (Math.random() - 0.5) * 10;

        const vertices = new Float32Array([
            -1, 0, 0,
            1, 0, 0
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const color = new THREE.Color().setHSL((midi.cc2 + 0.5) % 1.0, 1, 0.7); // Compliment color
        const mat = this.lineMaterial.clone();
        mat.color = color;

        const line = new THREE.Line(geometry, mat);

        line.position.set(0, 0, z);
        line.rotation.set(0, 0, Math.random() * Math.PI);

        // Random position
        line.position.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, z);

        line.scale.set(1, 1, 1);

        this.scene.add(line);

        this.lines.push({
            mesh: line,
            life: 0.5 + Math.random() * 0.5
        });
    }
}
