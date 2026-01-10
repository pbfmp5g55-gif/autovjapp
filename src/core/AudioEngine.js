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

  // Helper to fully stop MediaStream tracks (release Mic / System Audio)
  _stopCurrentStream() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
  }

  async enableMicrophone() {
    if (this.currentSource) {
      this.currentSource.disconnect();
    }
    this._stopCurrentStream();

    // Stop file playback if any
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.removeAttribute('src');
      if (this.audioElement.parentNode) this.audioElement.parentNode.removeChild(this.audioElement);
      this.audioElement = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.currentStream = stream; // Keep reference
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

  async enableSystemAudio() {
    if (this.currentSource) {
      this.currentSource.disconnect();
    }
    this._stopCurrentStream();
    // Stop file playback if any
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    try {
      // Use getDisplayMedia to capture system audio. Video is required but we'll ignore it.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      this.currentStream = stream; // Keep reference

      // Stop video track immediately as we only need audio
      stream.getVideoTracks().forEach(track => track.stop());

      if (stream.getAudioTracks().length === 0) {
        console.warn('No audio track found in system stream.');
        // User might have unchecked "Share audio"
        alert('音声トラックが見つかりませんでした。画面共有時に「システムオーディオを共有」にチェックを入れているか確認してください。');
        return;
      }

      this.currentSource = this.context.createMediaStreamSource(stream);

      // Create analyser if not exists
      if (!this.analyser) {
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 1024;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      }

      this.currentSource.connect(this.analyser);
      // System audio usually doesn't need to be connected to destination as it's already playing on the system.
      // However, if we are capturing a specific tab, muting might occur on that tab, so we might need to monitor it.
      // For now, let's assume standard loopback behavior which doesn't need output.

      console.log('System Audio Enabled');

      // Handle stream ended (user stops sharing)
      stream.getAudioTracks()[0].onended = () => {
        console.log('System Audio Stream Ended');
        // Ideally revert to something else or just leave it silent
      };

    } catch (err) {
      console.error('Error enabling system audio:', err);
    }
  }

  playFile(file) {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    // Stop any active stream (Mic, System)
    this._stopCurrentStream();

    const url = URL.createObjectURL(file);

    if (this.audioElement) {
      this.audioElement.pause();
    }

    this.audioElement = new Audio(url);
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.loop = true;
    this.audioElement.playsInline = true; // iOS fix
    // Append to DOM to ensure OS treats it as active media (fixes screen recording audio capture on some devices)
    this.audioElement.style.display = 'none';
    document.body.appendChild(this.audioElement);
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
