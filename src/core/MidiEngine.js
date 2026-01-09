export class MidiEngine {
    constructor() {
        this.ccs = {
            cc1: 0.5, // Total Intensity
            cc2: 0,   // Hue Offset
            cc3: 0.5, // Camera Distance
            cc4: 0,   // Deform / FX
            cc5: 0,   // Unused/Extra (NO MODE SWITCH)
            cc6: 0.5  // Sub Parameter
        };
        this.isInitialized = false;
        this.isAutoPilot = false;
    }

    async init() {
        if (this.isInitialized) return;
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported');
            return;
        }

        try {
            const access = await navigator.requestMIDIAccess();
            const inputs = access.inputs.values();
            for (let input of inputs) {
                input.onmidimessage = (msg) => this.handleMidiMessage(msg);
            }
            this.isInitialized = true;
            console.log('MidiEngine initialized');
        } catch (err) {
            console.error('Failed to initialize MidiEngine:', err);
        }
    }

    handleMidiMessage(msg) {
        const [status, data1, data2] = msg.data;
        const type = status & 0xf0;

        if (type === 0xb0) { // Control Change
            const cc = data1;
            const val = data2 / 127.0;

            if (cc === 1) this.ccs.cc1 = val;
            if (cc === 2) this.ccs.cc2 = val;
            if (cc === 3) this.ccs.cc3 = val;
            if (cc === 4) this.ccs.cc4 = val;
            if (cc === 5) this.ccs.cc5 = val;
            if (cc === 6) this.ccs.cc6 = val;

            console.log(`MIDI CC ${cc}: ${val}`);
        }
    }

    getCombined(audioVal, midiVal) {
        const mix = 0.4;
        return audioVal * (1 - mix) + midiVal * mix;
    }

    updateAutoPilot(time) {
        if (!this.isAutoPilot) return;

        // Smooth variations using sine waves with different frequencies
        // CC1: Intensity - Slow Pulse
        this.ccs.cc1 = (Math.sin(time * 0.5) * 0.5 + 0.5) * 0.8 + 0.2;

        // CC2: Hue - Continuous slow shift
        this.ccs.cc2 = (time * 0.1) % 1.0;

        // CC3: Camera - Very slow roam
        this.ccs.cc3 = Math.sin(time * 0.2) * 0.4 + 0.5;

        // CC4: FX - Random spikes or fast wave
        this.ccs.cc4 = Math.max(0, Math.sin(time * 1.5) * Math.sin(time * 0.5));

        // CC5/6: Generic movement (NO MODE SWITCHING)
        this.ccs.cc5 = Math.sin(time * 0.3) * 0.5 + 0.5;
        this.ccs.cc6 = Math.sin(time * 0.8) * 0.5 + 0.5;
    }

    toggleAutoPilot(enable) {
        this.isAutoPilot = enable;
        console.log(`Auto Pilot: ${enable}`);
    }
}
