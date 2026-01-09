export class AudioEngine {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.dataArray = null;
    this.isInitialized = false;

    this.bands = {
      low: 0,
      mid: 0,
      high: 0,
      beat: 0, // RMS or peak detection
      rms: 0
    };
  }

  async init() {
    if (this.isInitialized) return;

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();

      // Default to Microphone
      await this.enableMicrophone();

      this.isInitialized = true;
      console.log('AudioEngine initialized');
    } catch (err) {
      console.error('Failed to initialize AudioEngine:', err);
    }
  }

  async enableMicrophone() {
    if (this.currentSource) {
      this.currentSource.disconnect();
    }
    // Stop file playback if any
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.currentSource = this.context.createMediaStreamSource(stream);

    // Create analyser if not exists
    if (!this.analyser) {
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    this.currentSource.connect(this.analyser);
    // Note: Mic source is NOT connected to destination to avoid feedback loop
  }

  playFile(file) {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    const url = URL.createObjectURL(file);

    if (this.audioElement) {
      this.audioElement.pause();
    }

    this.audioElement = new Audio(url);
    this.audioElement.loop = true;
    this.audioElement.play();

    if (this.currentSource) {
      this.currentSource.disconnect();
    }

    this.currentSource = this.context.createMediaElementSource(this.audioElement);

    // Create analyser if not exists
    if (!this.analyser) {
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    this.currentSource.connect(this.analyser);
    // Connect file source to destination so we can hear it
    this.analyser.connect(this.context.destination);
  }

  update() {
    if (!this.isInitialized) return this.bands;

    this.analyser.getByteFrequencyData(this.dataArray);

    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    let totalSum = 0;

    const len = this.dataArray.length;
    const lowEnd = Math.floor(len * 0.1);
    const midEnd = Math.floor(len * 0.4);

    for (let i = 0; i < len; i++) {
      const val = this.dataArray[i] / 255.0;
      totalSum += val;
      if (i < lowEnd) lowSum += val;
      else if (i < midEnd) midSum += val;
      else highSum += val;
    }

    this.bands.low = lowSum / lowEnd || 0;
    this.bands.mid = midSum / (midEnd - lowEnd) || 0;
    this.bands.high = highSum / (len - midEnd) || 0;
    this.bands.rms = totalSum / len || 0;

    // Pulse/Beat detection (simple threshold)
    this.bands.beat = this.bands.low > 0.6 ? 1.0 : this.bands.low;

    return this.bands;
  }
}
