
import * as THREE from 'three';
import videoDeckVert from '../shaders/video_deck.vert?raw';
import videoDeckFrag from '../shaders/video_deck.frag?raw';

export class VideoManager {
    constructor(scene) {
        this.scene = scene;

        // Storage
        this.videos = []; // Array of { id, file, url, element, texture, note, status, duration }
        this.noteMapping = {}; // note (int) -> videoId

        // Playback State
        this.deckA = { videoId: null, texture: null };
        this.deckB = { videoId: null, texture: null };
        this.activeDeck = 'A'; // 'A' or 'B' (Target deck)
        this.mixValue = 0.0; // 0.0 = A, 1.0 = B

        this.isTransitioning = false;
        this.transitionStartTime = 0;
        this.transitionDuration = 500; // ms
        this.transitionType = 'FADE'; // 'CUT', 'FADE'

        // Global Params
        this.playbackSpeed = 1.0;
        this.loopEnabled = true;

        // Auto Pilot
        this.autoPilot = false; // Video Auto Switch State
        this.lastAutoTrigger = 0;
        this.autoPilotInterval = 2000; // 2sec default
        this.avoidRepeat = true;
        this.kickFlashEnabled = true; // Use global kick flash state

        this.initVisuals();

    }

    setAutoPilot(enable) {
        this.autoPilot = enable;
        console.log("Video Auto Switch:", enable);
    }

    setFlashEnabled(enable) {
        this.kickFlashEnabled = enable;
    }


    initVisuals() {
        // Create 2 textures that will be swapped
        const dummyC = document.createElement('canvas');
        dummyC.width = 1; dummyC.height = 1;

        this.deckA.texture = new THREE.CanvasTexture(dummyC);
        this.deckB.texture = new THREE.CanvasTexture(dummyC);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                texA: { value: this.deckA.texture },
                texB: { value: this.deckB.texture },
                mixVal: { value: 0.0 }, // 0=A, 1=B
                blendMode: { value: 0 }, // 0:Mix, 1:Add, 2:Screen, 3:Multiply, 4:Overlay
                brightness: { value: 1.0 },
                contrast: { value: 1.0 },
                saturation: { value: 1.0 },
                hueShift: { value: 0.0 },
                pixelate: { value: 0.0 },
                invert: { value: 0.0 },
                distort: { value: 0.0 },
                mono: { value: 0.0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: videoDeckVert,
            fragmentShader: videoDeckFrag,
            side: THREE.DoubleSide
        });

        // Fullscreen Quad
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(30 * 2, 18 * 2), this.material);
        this.mesh.position.z = -20;
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    addVideos(files, onProgress) {
        Array.from(files).forEach(file => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.src = url;
            video.muted = true;
            video.loop = this.loopEnabled;
            video.playsInline = true;
            video.crossOrigin = "anonymous";
            video.preload = "auto";

            const id = 'v_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

            const vObj = {
                id: id,
                file: file,
                name: file.name,
                url: url,
                element: video,
                status: 'loading', // loading, ready, error, need_tap
                duration: 0,
                thumb: null, // DataURL
                assignedNote: null
            };

            // Events
            video.onloadeddata = () => {
                vObj.status = 'ready';
                vObj.duration = video.duration;

                // Generate Thumbnail
                const canvas = document.createElement('canvas');
                canvas.width = 160;
                canvas.height = 90;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, 160, 90);
                vObj.thumb = canvas.toDataURL('image/jpeg', 0.5);

                if (onProgress) onProgress(id, 'ready');
            };

            video.onerror = () => {
                vObj.status = 'error';
                if (onProgress) onProgress(id, 'error');
            };

            this.videos.push(vObj);

            // Auto Assign: Find first empty slot starting from 36
            for (let n = 36; n < 127; n++) {
                if (!this.noteMapping[n]) {
                    this.assignNote(id, n);
                    break;
                }
            }

            if (onProgress) onProgress(id, 'added');
        });
    }

    removeVideo(id) {
        const idx = this.videos.findIndex(v => v.id === id);
        if (idx >= 0) {
            const v = this.videos[idx];
            // Revoke blob
            URL.revokeObjectURL(v.url);
            // Remove mapping
            if (v.assignedNote !== null) {
                delete this.noteMapping[v.assignedNote];
            }
            this.videos.splice(idx, 1);
        }
    }

    assignNote(videoId, note) {
        // Clear previous assignment for this note
        if (this.noteMapping[note]) {
            const oldId = this.noteMapping[note];
            const oldV = this.videos.find(v => v.id === oldId);
            if (oldV) oldV.assignedNote = null;
        }

        // Clear previous note for this video
        const v = this.videos.find(v => v.id === videoId);
        if (v) {
            if (v.assignedNote !== null) {
                delete this.noteMapping[v.assignedNote];
            }
            v.assignedNote = note;
            this.noteMapping[note] = videoId;
        }
    }

    triggerNote(note) {
        const videoId = this.noteMapping[note];
        if (videoId) {
            this.triggerVideo(videoId);
        }
    }

    // Main Trigger Logic
    // Main Trigger Logic
    async triggerVideo(videoId) {
        const vObj = this.videos.find(v => v.id === videoId);
        if (!vObj || vObj.status === 'error') return;

        // Reset video logic (start from 0)
        vObj.element.currentTime = 0;
        vObj.element.loop = this.loopEnabled;
        vObj.element.playbackRate = this.playbackSpeed;

        let targetDeck = (this.activeDeck === 'A') ? 'B' : 'A';

        // Setup Texture
        const newTex = new THREE.VideoTexture(vObj.element);
        newTex.colorSpace = THREE.SRGBColorSpace;

        if (targetDeck === 'B') {
            this.deckB.videoId = videoId;
            if (this.deckB.texture) this.deckB.texture.dispose();
            this.deckB.texture = newTex;
            this.material.uniforms.texB.value = newTex;

            try {
                await vObj.element.play();
                vObj.status = 'ready'; // Recover if it was in need_tap
                this.startTransition('B');
            } catch (e) {
                console.warn("Autoplay blocked:", e);
                vObj.status = 'need_tap';
                this.handleTapNeeded(vObj);
            }

        } else {
            this.deckA.videoId = videoId;
            if (this.deckA.texture) this.deckA.texture.dispose();
            this.deckA.texture = newTex;
            this.material.uniforms.texA.value = newTex;

            try {
                await vObj.element.play();
                vObj.status = 'ready';
                this.startTransition('A');
            } catch (e) {
                console.warn("Autoplay blocked:", e);
                vObj.status = 'need_tap';
                this.handleTapNeeded(vObj);
            }
        }
    }

    handleTapNeeded(vObj) {
        const event = new CustomEvent('video-tap-needed', { detail: { videoId: vObj.id, name: vObj.name, element: vObj.element } });
        window.dispatchEvent(event);
    }

    startTransition(target) {
        this.activeDeck = target;
        this.transitionStartTime = performance.now();
        this.isTransitioning = true;

        // If CUT, instant
        if (this.transitionType === 'CUT') {
            this.mixValue = (target === 'B') ? 1.0 : 0.0;
            this.isTransitioning = false;
            // Stop OLD deck video?
            this.stopDeck(target === 'B' ? 'A' : 'B');
        } else {
            // FADE
            // Logic handled in update()
        }
    }

    stopDeck(deck) {
        // Optional: Pause video to save CPU
        if (deck === 'A' && this.deckA.videoId) {
            const v = this.videos.find(i => i.id === this.deckA.videoId);
            if (v) v.element.pause();
        } else if (deck === 'B' && this.deckB.videoId) {
            const v = this.videos.find(i => i.id === this.deckB.videoId);
            if (v) v.element.pause();
        }
    }

    update(time, midi, audio) {
        if (!this.mesh.visible) return;

        // 1. Transition Logic
        if (this.isTransitioning) {
            const now = performance.now();
            const progress = (now - this.transitionStartTime) / this.transitionDuration;

            if (progress >= 1.0) {
                this.isTransitioning = false;
                this.mixValue = (this.activeDeck === 'B') ? 1.0 : 0.0;
                this.stopDeck(this.activeDeck === 'B' ? 'A' : 'B');
            } else {
                if (this.activeDeck === 'B') {
                    this.mixValue = progress; // 0 -> 1
                } else {
                    this.mixValue = 1.0 - progress; // 1 -> 0
                }
            }
        }
        this.material.uniforms.mixVal.value = this.mixValue;

        // 2. MIDI CC Application (Base Values)

        // CC1: Manual Crossfader (Override if not transitioning)
        if (midi.cc1 !== undefined && !this.isTransitioning) {
            this.mixValue = midi.cc1;
            this.material.uniforms.mixVal.value = this.mixValue;
        }

        // CC2: Contrast
        if (midi.cc2 !== undefined) this.material.uniforms.contrast.value = 0.5 + midi.cc2 * 3.0;

        // CC3: Distort
        if (midi.cc3 !== undefined) this.material.uniforms.distort.value = midi.cc3 * 2.0;

        // CC4: Hue Shift
        if (midi.cc4 !== undefined) this.material.uniforms.hueShift.value = midi.cc4;

        // CC5: Invert
        if (midi.cc5 !== undefined) this.material.uniforms.invert.value = (midi.cc5 > 0.5) ? 1.0 : 0.0;

        // CC6: Monochrome
        if (midi.cc6 !== undefined) this.material.uniforms.mono.value = midi.cc6;

        // CC7: Speed
        if (midi.cc7 !== undefined) {
            let speed = 0.25 + midi.cc7 * 3.75;
            if (Math.abs(speed - 1.0) < 0.1) speed = 1.0;
            if (Math.abs(this.playbackSpeed - speed) > 0.01) {
                this.playbackSpeed = speed;
                this.videos.forEach(v => {
                    if (!v.element.paused) v.element.playbackRate = speed;
                });
            }
        }

        // CC8: Pixelate
        if (midi.cc8 !== undefined) this.material.uniforms.pixelate.value = (midi.cc8 > 0.05) ? midi.cc8 : 0.0;


        // 3. Audio Reactivity (Add/Override)
        if (audio) {
            // Beat Flash -> Invert Spike (Global Toggle)
            if (this.kickFlashEnabled && audio.beat > 0.7) {
                this.material.uniforms.invert.value = 1.0;
                setTimeout(() => { if (this.material) this.material.uniforms.invert.value = 0.0; }, 50);
            }

            // Low/Bass -> Distortion (Enhance existing)
            if (audio.low > 0.4) {
                const currentDistort = this.material.uniforms.distort.value;
                this.material.uniforms.distort.value = Math.max(currentDistort, audio.low * 0.5);
            }

            // High -> Hue Jitter (Enhance existing)
            if (audio.high > 0.6) {
                this.material.uniforms.hueShift.value += 0.05; // Subtle jitter
            }
        }

        // 4. Video Auto Switch (Random Trigger)
        if (this.autoPilot) {
            const now = performance.now();
            if (now - this.lastAutoTrigger > this.autoPilotInterval) {
                this.triggerRandom();
                this.lastAutoTrigger = now;
            }
        }
    }

    triggerRandom() {
        // Find assigned videos
        const assignedNotes = Object.keys(this.noteMapping);
        if (assignedNotes.length === 0) return;

        const note = assignedNotes[Math.floor(Math.random() * assignedNotes.length)];
        this.triggerNote(parseInt(note));

        // Randomize Effects for VJ feel
        if (Math.random() > 0.6) { // Reduced freq from 0.5 to 0.4 (invert logic > 0.6)
            // Random glitch
            // Invert: Rare & short
            this.material.uniforms.invert.value = (Math.random() > 0.9) ? 1.0 : 0.0;

            // Distort: Milder range (0.0 - 0.5 instead of full)
            this.material.uniforms.distort.value = (Math.random() > 0.7) ? Math.random() * 0.5 : 0.0;

            // Mono: Occasional
            this.material.uniforms.mono.value = (Math.random() > 0.8) ? 1.0 : 0.0;

            // Hue: Subtle shift
            this.material.uniforms.hueShift.value = (Math.random() > 0.8) ? Math.random() : 0.0;


            // Reset heavily distorted values quickly? 
            // Logic in update() overwrites via MIDI CC, but AutoPilot simulates MIDI?
            // No, AutoPilot usually triggers notes.
            // We need a way to override CCs or have "virtual CCs" driven by AutoPilot.
            // For now, setting uniforms directly works until next MIDI CC update frame overwrites it.
            // If no MIDI connected, this works great.
        } else {
            // Reset to clean sometimes
            this.material.uniforms.invert.value = 0.0;
            this.material.uniforms.distort.value = 0.0;
            this.material.uniforms.mono.value = 0.0;
        }
    }

    setVisible(v) {
        this.mesh.visible = v;
    }

    getVideoList() {
        return this.videos;
    }
}
