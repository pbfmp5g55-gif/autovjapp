import * as THREE from 'three';
import blobVert from '../shaders/blob.vert?raw';
import blobFrag from '../shaders/blob.frag?raw';
import bgVert from '../shaders/rainbow_bg.vert?raw';
import bgFrag from '../shaders/rainbow_bg.frag?raw';
import presetsData from '../presets/blobSwarmPresets.json';
import { AudioAnalyzerHelper } from '../audio/Analyzer';

export class BlobSwarmMode {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        // Init with first preset
        this.presets = presetsData;
        this.currentPreset = this.presets[0];

        // Initialize Blob (Cylinder/Tube shape)
        // RadiusTop, RadiusBottom, Height, RadialSegments, HeightSegments
        const geo = new THREE.CylinderGeometry(0.5, 0.5, 4, 32, 64);
        this.blobMaterial = new THREE.ShaderMaterial({
            vertexShader: blobVert,
            fragmentShader: blobFrag,
            uniforms: {
                time: { value: 0 },
                displacementAmp: { value: 0.1 },
                displacementFreq: { value: 1.0 },
                hueShiftSpeed: { value: 0.1 },
                fresnelPower: { value: 2.0 },
                iridescence: { value: 1.0 },
                opacity: { value: 1.0 },
                baseColor: { value: new THREE.Color(0.5, 0.5, 0.5) }
            },
            transparent: true,
            side: THREE.DoubleSide
        });
        this.blobMesh = new THREE.Mesh(geo, this.blobMaterial);
        this.group.add(this.blobMesh);

        // Initialize Rainbow Background
        const bgGeo = new THREE.SphereGeometry(60, 32, 32);
        this.bgMaterial = new THREE.ShaderMaterial({
            vertexShader: bgVert,
            fragmentShader: bgFrag,
            uniforms: {
                time: { value: 0 },
                intensity: { value: 0 }
            },
            side: THREE.BackSide
        });
        this.bgMesh = new THREE.Mesh(bgGeo, this.bgMaterial);
        this.group.add(this.bgMesh);

        // Initialize Orbs
        const maxCapacity = 1500; // Buffer
        const orbGeo = new THREE.SphereGeometry(1, 8, 8);
        const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Glow handled by bloom

        this.orbsMesh = new THREE.InstancedMesh(orbGeo, orbMat, maxCapacity);
        this.orbsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(this.orbsMesh);

        this.orbData = [];
        for (let i = 0; i < maxCapacity; i++) {
            this.orbData.push({
                active: false,
                life: 0,
                maxLife: 1,
                angle: Math.random() * Math.PI * 2,
                radius: 2,
                speed: 1,
                size: 1,
                phase: Math.random() * 100
            });
            this.orbsMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
        }

        this.time = 0;
        this.lastTime = performance.now();

        this.applyPreset(this.currentPreset.id);
    }

    applyPreset(id) {
        const p = this.presets.find(x => x.id === id);
        if (!p) return;
        this.currentPreset = p;

        // Update Blob Params
        this.blobMaterial.uniforms.displacementAmp.value = p.blob.displacementAmp;
        this.blobMaterial.uniforms.displacementFreq.value = p.blob.displacementFreq;
        this.blobMaterial.uniforms.hueShiftSpeed.value = p.blob.hueShiftSpeed;
        this.blobMaterial.uniforms.fresnelPower.value = p.blob.fresnelPower;
        this.blobMaterial.uniforms.iridescence.value = p.blob.iridescence;
        this.blobMaterial.uniforms.opacity.value = p.blob.opacity;

        // Update Geometry if needed (subdiv check)
        // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments)
        // We use subdiv parameter to control heightSegments
        if (this.blobMesh.geometry.parameters && this.blobMesh.geometry.parameters.heightSegments !== p.blob.subdiv * 10) {
            this.blobMesh.geometry.dispose();
            // Tall cylinder
            this.blobMesh.geometry = new THREE.CylinderGeometry(0.6, 0.6, 6, 32, p.blob.subdiv * 10);
        }
        this.blobMesh.scale.setScalar(p.blob.scale);

        // Override Background logic: We use our own mesh now.
        // If we want to use 'solid' capability, we just hide the mesh and set scene bg?
        // But user requested "Rainbow", so we default to showing the mesh.
        this.bgMesh.visible = true;

        /*
        if(p.background.mode === 'solid') {
        this.scene.background = new THREE.Color(p.background.color);
        if(this.scene.fog && this.scene.fog.isFogExp2) {
            this.scene.fog.color = new THREE.Color(p.background.color);
        }
        // If solid is forced, maybe hide bgMesh? 
        // User asked for Rainbow background, so we might ignore solid for now
        // or blend it. For now, let's prioritize the rainbow mesh.
        }
        */
    }

    resetOrbs() {
        for (let i = 0; i < this.orbData.length; i++) {
            this.orbData[i].active = false;
            this.orbsMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
        }
        this.orbsMesh.instanceMatrix.needsUpdate = true;
    }

    update(audio) {
        const now = performance.now();
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        if (dt > 0.1) dt = 0.1; // clamp frame jumps

        this.time += dt;
        this.blobMaterial.uniforms.time.value = this.time;
        this.bgMaterial.uniforms.time.value = this.time;

        const p = this.currentPreset;
        const intensity = p.reactive.intensity;

        this.bgMaterial.uniforms.intensity.value = audio.high * p.reactive.intensity;

        // --- Blob Logic ---
        // Target Displacement based on LOW
        // Boosted multiplier: 0.8 -> 3.0 for more visible deformation
        const targetDisp = p.blob.displacementAmp + (audio.low * intensity * 3.0);
        // Smooth lerp
        const currentDisp = this.blobMaterial.uniforms.displacementAmp.value;
        this.blobMaterial.uniforms.displacementAmp.value += (targetDisp - currentDisp) * 10.0 * dt; // Faster lerp

        // Rotation
        // Boosted: 0.2 -> 1.5, 0.1 -> 0.8
        this.blobMesh.rotation.y += (p.blob.rotationSpeed + audio.mid * intensity * 1.5) * dt;
        this.blobMesh.rotation.x += (audio.high * intensity * 0.8) * dt;

        // --- Orbs Logic ---
        const orbsP = p.orbs;

        // Target Count
        let targetNum = orbsP.baseOrbs + (audio.rms * orbsP.targetRange * intensity);
        if (audio.beat > 0.6) targetNum += (orbsP.spawnRate * p.reactive.onsetBurst * 5.0);

        targetNum = Math.min(targetNum, orbsP.maxOrbs);


        const activeIndices = [];
        const inactiveIndices = [];
        for (let i = 0; i < this.orbData.length; i++) {
            if (this.orbData[i].active) activeIndices.push(i);
            else inactiveIndices.push(i);
        }

        // Spawn
        if (activeIndices.length < targetNum) {
            const deficit = targetNum - activeIndices.length;
            const maxSpawnPerFrame = Math.ceil(orbsP.spawnRate * dt);
            const toSpawn = Math.min(deficit, maxSpawnPerFrame);

            for (let k = 0; k < toSpawn; k++) {
                if (inactiveIndices.length > 0) {
                    const idx = inactiveIndices.pop();
                    this.activateOrb(this.orbData[idx]);
                }
            }
        }

        // Dummy used for Matrix calculation
        const dummy = new THREE.Object3D();

        let activeOrbsCount = 0;

        for (let i = 0; i < this.orbData.length; i++) {
            const orb = this.orbData[i];
            if (!orb.active) continue;

            activeOrbsCount++;
            orb.life -= dt;

            // Despawn condition
            let shouldDie = orb.life <= 0;

            if (activeIndices.length > targetNum + 50) {
                orb.life -= dt * 2.0; // Die 3x faster
            }

            if (shouldDie) {
                orb.active = false;
                this.orbsMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
                continue;
            }

            // Update Position
            // Boosted speed reation: 2.0 -> 5.0
            orb.angle += (orb.speed + (audio.mid * 5.0 * intensity)) * dt;

            // Boosted Noise motion
            const yNoise = Math.sin(this.time * 3.0 + orb.phase) * orbsP.noiseAmount * 2.0;
            const rNoise = Math.cos(this.time * 2.5 + orb.phase) * orbsP.noiseAmount * 1.5;

            // Reaction to Low freq on radius
            const r = orb.radius + rNoise + (audio.low * 2.5 * intensity);

            dummy.position.set(
                Math.cos(orb.angle) * r,
                yNoise + (Math.sin(orb.angle * 3.0) * 0.8), // More Wobbly
                Math.sin(orb.angle) * r
            );

            // Look at center (approx)
            dummy.lookAt(0, 0, 0);

            // Scale logic
            const fadeIn = Math.min(1, (orb.maxLife - orb.life) * 2.0);
            const fadeOut = Math.min(1, orb.life * 1.0);
            const beatScale = 1.0 + (audio.high * intensity * 0.5);
            const s = orb.size * fadeIn * fadeOut * beatScale;

            dummy.scale.setScalar(s);
            dummy.updateMatrix();

            this.orbsMesh.setMatrixAt(i, dummy.matrix);
        }

        this.orbsMesh.instanceMatrix.needsUpdate = true;
    }

    activateOrb(orb) {
        const p = this.currentPreset.orbs;

        orb.active = true;
        orb.maxLife = THREE.MathUtils.randFloat(p.lifeSec[0], p.lifeSec[1]);
        orb.life = orb.maxLife;
        orb.angle = Math.random() * Math.PI * 2;
        orb.radius = THREE.MathUtils.randFloat(p.orbitRadius[0], p.orbitRadius[1]);
        orb.speed = p.orbitSpeed * (Math.random() > 0.5 ? 1 : -1) * THREE.MathUtils.randFloat(0.8, 1.2);
        orb.size = THREE.MathUtils.randFloat(p.size[0], p.size[1]);
        orb.phase = Math.random() * 100;
    }

    setVisible(visible) {
        this.group.visible = visible;
        if (visible && this.currentPreset) {
            // Re-apply background
            this.applyPreset(this.currentPreset.id);
        }
    }

    // Quality Control for Mobile
    setQuality(level) {
        // level: 0=Low, 1=Med, 2=High
        if (level === 0) {
            this.blobMesh.geometry = new THREE.CylinderGeometry(0.6, 0.6, 6, 16, 20); // Very Low
        } else if (level === 1) {
            this.blobMesh.geometry = new THREE.CylinderGeometry(0.6, 0.6, 6, 24, 40);
        } else {
            this.blobMesh.geometry = new THREE.CylinderGeometry(0.6, 0.6, 6, 32, 80);
        }
    }
}
