class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.chunkSize = 512; // 32ms at 16kHz
    this.pcmBuffer = new Int16Array(this.chunkSize);
    this.pcmOffset = 0;
    this.resamplePos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }
    const channel = input[0];
    const ratio = sampleRate / this.targetRate;

    if (Math.abs(ratio - 1.0) < 0.01) {
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        this.pcmBuffer[this.pcmOffset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.pcmOffset >= this.chunkSize) {
          this.flushChunk();
        }
      }
    } else {
      while (this.resamplePos < channel.length) {
        const idx = Math.floor(this.resamplePos);
        const s = Math.max(-1, Math.min(1, channel[idx]));
        this.pcmBuffer[this.pcmOffset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.pcmOffset >= this.chunkSize) {
          this.flushChunk();
        }
        this.resamplePos += ratio;
      }
      this.resamplePos -= channel.length;
    }

    return true;
  }

  flushChunk() {
    const out = this.pcmBuffer.slice(0, this.chunkSize);
    this.port.postMessage({ type: 'pcm16', buffer: out.buffer }, [out.buffer]);
    this.pcmOffset = 0;
  }
}

registerProcessor('mic-processor', MicProcessor);
