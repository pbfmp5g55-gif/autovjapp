import p5 from 'p5';

export class P5Manager {
    constructor(containerId) {
        this.containerId = containerId;
        this.p5Instance = null;
        this.currentPreset = 'Noise Field';
        this.isVisible = false;

        this.audioData = { low: 0, mid: 0, high: 0, beat: 0, rms: 0 };
        this.midiCC = { cc1: 0, cc2: 0, cc3: 0, cc4: 0 };
    }

    init() {
        if (this.p5Instance) return;

        const sketch = (p) => {
            p.setup = () => {
                const w = p.windowWidth;
                const h = p.windowHeight;
                p.createCanvas(w, h);
                p.colorMode(p.HSB, 100);
                p.rectMode(p.CENTER);

                // Start loop only if visible
                if (!this.isVisible) p.noLoop();
            };

            p.windowResized = () => {
                p.resizeCanvas(p.windowWidth, p.windowHeight);
            };

            p.draw = () => {
                // If draw is called but invisible, stop loop (Safety)
                if (!this.isVisible) {
                    p.noLoop();
                    return;
                }

                p.background(0, 0, 0, 20); // Fade background

                switch (this.currentPreset) {
                    case 'Noise Field': this.drawNoiseField(p); break;
                    case 'Glitch Scan': this.drawGlitchScan(p); break;
                    case 'Kaleido Mirror': this.drawKaleido(p); break;
                    case 'Op Art Moiré': this.drawOpArt(p); break;
                    case 'Particle Constellation': this.drawParticles(p); break;
                    default: this.drawNoiseField(p);
                }
            };
        };

        try {
            const container = document.getElementById(this.containerId);
            if (container) {
                this.p5Instance = new p5(sketch, container);
            }
        } catch (e) {
            console.error('P5 Init Error:', e);
        }
    }

    update(audio, midi) {
        if (!this.isVisible) return;
        this.audioData = audio;
        this.midiCC = midi;
    }

    setPreset(name) {
        this.currentPreset = name;
        // If visible, clear background once
        if (this.isVisible && this.p5Instance && this.p5Instance.background) {
            this.p5Instance.background(0);
        }
    }

    setVisible(visible) {
        this.isVisible = visible;
        const el = document.getElementById(this.containerId);
        if (el) el.style.display = visible ? 'block' : 'none';

        if (this.p5Instance) {
            if (visible) {
                this.p5Instance.loop();
            } else {
                this.p5Instance.noLoop();
            }
        }
    }

    // --- Presets (Using 'p' passed from draw) ---

    drawNoiseField(p) {
        const t = p.millis() * 0.001;
        const scale = 0.01 + this.midiCC.cc3 * 0.05;
        const speed = t * (0.5 + this.audioData.mid + this.midiCC.cc1);

        p.noStroke();
        const density = 20 + Math.floor(this.audioData.high * 30);

        for (let i = 0; i < density; i++) {
            const x = p.random(p.width);
            const y = p.random(p.height);
            const n = p.noise(x * scale, y * scale, speed);

            const hue = (this.midiCC.cc2 * 100 + n * 50) % 100;
            const size = (n * 50 + this.audioData.low * 100) * (0.2 + this.midiCC.cc4);

            p.fill(hue, 80, 100, 80);
            p.circle(x, y, size);
        }
    }

    drawGlitchScan(p) {
        const bars = 10 + Math.floor(this.audioData.low * 20);
        const w = p.width;
        const h = p.height / bars;

        for (let i = 0; i < bars; i++) {
            if (p.random() > 0.8 - this.midiCC.cc1 * 0.5) {
                const y = i * h;
                const shift = (p.random() - 0.5) * p.width * (this.audioData.beat + this.midiCC.cc4);
                const hue = (this.midiCC.cc2 * 100 + i * 5) % 100;
                p.fill(hue, 90, 100);
                p.rect(w / 2 + shift, y + h / 2, w, h * 0.9);
            }
        }
        const lineY = (p.millis() * (0.2 + this.midiCC.cc3)) % p.height;
        p.stroke(0, 0, 100);
        p.line(0, lineY, p.width, lineY);
    }

    drawKaleido(p) {
        const slices = 4 + Math.floor(this.midiCC.cc4 * 8);
        const angle = p.TWO_PI / slices;
        const cx = p.width / 2;
        const cy = p.height / 2;

        p.translate(cx, cy);

        const hue = (p.frameCount + this.midiCC.cc2 * 100) % 100;
        p.stroke(hue, 80, 100);
        p.noFill();
        p.strokeWeight(2 + this.audioData.high * 5);

        for (let i = 0; i < slices; i++) {
            p.rotate(angle);
            p.push();
            const d = p.mouseY || this.midiCC.cc3 * p.height;
            const shapeSize = (this.midiCC.cc1 * 100 + this.audioData.low * 100);
            p.rect(d * 0.5, 0, shapeSize, shapeSize);
            p.pop();
        }
    }

    drawOpArt(p) {
        const spacing = 10 + this.midiCC.cc3 * 40;
        p.noFill();
        p.stroke((this.midiCC.cc2 * 100), 80, 100);
        p.strokeWeight(2);
        const cx = p.width / 2;
        const cy = p.height / 2;

        for (let r = 0; r < p.width; r += spacing) {
            p.circle(cx, cy, r + this.audioData.low * 50);
        }
        const offX = (p.noise(p.millis() * 0.001) - 0.5) * p.width * (this.midiCC.cc4 + this.audioData.beat);
        const offY = (p.noise(p.millis() * 0.001 + 100) - 0.5) * p.height * (this.midiCC.cc4 + this.audioData.beat);

        p.stroke((this.midiCC.cc2 * 100 + 50) % 100, 80, 100);
        for (let r = 0; r < p.width; r += spacing) {
            p.circle(cx + offX, cy + offY, r);
        }
    }

    drawParticles(p) {
        p.translate(p.width / 2, p.height / 2);
        const count = 50 + Math.floor(this.midiCC.cc1 * 100);
        const radius = p.height * 0.4 * (1 + this.audioData.beat * 0.2);
        const hueBase = this.midiCC.cc2 * 100;
        p.strokeWeight(2);

        for (let i = 0; i < count; i++) {
            const angle = (p.frameCount * 0.01 + i) + (i * 0.1 * this.midiCC.cc3);
            const r = Math.sin(p.frameCount * 0.02 + i) * radius;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            p.stroke((hueBase + i) % 100, 80, 100);
            p.point(x, y);
            if (i > 0 && p.dist(x, y, 0, 0) < 100 * (1 + this.midiCC.cc4)) {
                p.line(x, y, 0, 0);
            }
        }
    }
}
