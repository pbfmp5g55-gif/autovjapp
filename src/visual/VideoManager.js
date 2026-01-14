
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
        this.transitionType = 'CUT'; // 'CUT', 'FADE'

        // Global Params
        this.playbackSpeed = 1.0;
        this.loopEnabled = true;

        // Auto Pilot
        this.autoPilot = false;
        this.autoPilotInterval = 2000;
        this.lastAutoTrigger = 0;
        this.avoidRepeat = true;

        this.initVisuals();
    }

        this.initVisuals();
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

update(time, midi) {
    // 1. Transition
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

    // 2. MIDI CC Application (Video Mode Specific)
    // CC1: Brightness - Clamp 0.2 to 2.0 (Avoid pure black)
    if (midi.cc1 !== undefined) this.material.uniforms.brightness.value = 0.2 + midi.cc1 * 1.8;

    // CC2: Contrast - Clamp 0.5 to 2.5
    if (midi.cc2 !== undefined) this.material.uniforms.contrast.value = 0.5 + midi.cc2 * 2.0;

    // CC3: Saturation - Clamp 0.0 to 2.0
    if (midi.cc3 !== undefined) this.material.uniforms.saturation.value = midi.cc3 * 2.0;

    // CC4: Hue
    if (midi.cc4 !== undefined) this.material.uniforms.hueShift.value = midi.cc4;

    // CC5: Blend Mode
    if (midi.cc5 !== undefined) {
        const mode = Math.floor(midi.cc5 * 4.9); // 0-4
        this.material.uniforms.blendMode.value = mode;
    }

    // CC6: Pixelate
    if (midi.cc6 !== undefined) this.material.uniforms.pixelate.value = (midi.cc6 > 0.05) ? midi.cc6 : 0.0;

    // CC7: Playback Speed
    if (midi.cc7 !== undefined) {
        // 0.25 to 2.0
        let speed = 0.25 + midi.cc7 * 1.75;
        if (Math.abs(speed - 1.0) < 0.1) speed = 1.0; // Snap to 1
        this.playbackSpeed = speed;

        // Apply to active elements
        this.videos.forEach(v => {
            if (!v.element.paused) v.element.playbackRate = speed;
        });
    }

    // CC8: Loop
    if (midi.cc8 !== undefined) {
        this.loopEnabled = midi.cc8 > 0.5;
        this.videos.forEach(v => v.element.loop = this.loopEnabled);
    }

    // CC9: Transition Time
    if (midi.cc9 !== undefined) {
        this.transitionDuration = 100 + midi.cc9 * 2000; // 100ms - 2100ms
    }

    // CC10: Transition Type
    if (midi.cc10 !== undefined) {
        this.transitionType = (midi.cc10 > 0.5) ? 'FADE' : 'CUT';
    }

    // 3. Auto Pilot
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

    // Filter out current playing if avoidRepeat
    let candidates = assignedNotes;
    if (this.avoidRepeat && assignedNotes.length > 1) {
        // Determine current note? We don't track Current Note explicitly, just deck.
        // But we can guess.
    }

    const note = candidates[Math.floor(Math.random() * candidates.length)];
    this.triggerNote(parseInt(note));
}

setVisible(v) {
    this.mesh.visible = v;
}

getVideoList() {
    return this.videos;
}
}
