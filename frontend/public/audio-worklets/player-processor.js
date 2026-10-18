class PlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 60 seconds capacity at 24kHz
    this.capacity = 24000 * 60;
    this.ring = new Float32Array(this.capacity);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;
    this.wasSpeaking = false;
    this.silentFrames = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'flush') {
        this.readIndex = 0;
        this.writeIndex = 0;
        this.available = 0;
        if (this.wasSpeaking) {
          this.wasSpeaking = false;
          this.port.postMessage({ type: 'speaking', speaking: false });
        }
        return;
      }
      if (msg.type === 'enqueue' && msg.samples) {
        const samples = msg.samples;
        const len = samples.length;
        for (let i = 0; i < len; i++) {
          if (this.available < this.capacity) {
            this.ring[this.writeIndex] = samples[i];
            this.writeIndex = (this.writeIndex + 1) % this.capacity;
            this.available++;
          }
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const channel = output[0];
    const len = channel.length;

    if (this.available > 0) {
      for (let i = 0; i < len; i++) {
        if (this.available > 0) {
          channel[i] = this.ring[this.readIndex];
          this.readIndex = (this.readIndex + 1) % this.capacity;
          this.available--;
        } else {
          channel[i] = 0;
        }
      }
      this.silentFrames = 0;
      if (!this.wasSpeaking) {
        this.wasSpeaking = true;
        this.port.postMessage({ type: 'speaking', speaking: true });
      }
    } else {
      for (let i = 0; i < len; i++) {
        channel[i] = 0;
      }
      if (this.wasSpeaking) {
        this.silentFrames += len;
        if (this.silentFrames > 4800) {
          this.wasSpeaking = false;
          this.port.postMessage({ type: 'speaking', speaking: false });
        }
      }
    }

    return true;
  }
}

registerProcessor('player-processor', PlayerProcessor);
