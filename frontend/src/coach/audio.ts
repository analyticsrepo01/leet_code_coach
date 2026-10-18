import { useAppStore } from '../store';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToInt16Array(base64: string): Int16Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

class CoachAudioManager {
  private micContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micNode: AudioWorkletNode | null = null;

  private playerContext: AudioContext | null = null;
  private playerNode: AudioWorkletNode | null = null;
  private playerReadyPromise: Promise<void> | null = null;

  public async ensurePlayer(): Promise<void> {
    if (this.playerNode && this.playerContext) {
      if (this.playerContext.state === 'suspended') {
        await this.playerContext.resume();
      }
      return;
    }
    if (this.playerReadyPromise) {
      return this.playerReadyPromise;
    }

    this.playerReadyPromise = (async () => {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.playerContext = new AudioCtx({ sampleRate: 24000 });
      await this.playerContext.audioWorklet.addModule(
        '/audio-worklets/player-processor.js'
      );
      this.playerNode = new AudioWorkletNode(
        this.playerContext,
        'player-processor'
      );
      this.playerNode.port.onmessage = (event) => {
        if (event.data?.type === 'speaking') {
          useAppStore.getState().setCoachSpeaking(Boolean(event.data.speaking));
        }
      };
      this.playerNode.connect(this.playerContext.destination);
      if (this.playerContext.state === 'suspended') {
        await this.playerContext.resume();
      }
    })();

    return this.playerReadyPromise;
  }

  public async enqueueAudioBase64(base64Pcm24k: string): Promise<void> {
    try {
      await this.ensurePlayer();
      if (!this.playerNode) return;
      const pcm16 = base64ToInt16Array(base64Pcm24k);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }
      this.playerNode.port.postMessage({
        type: 'enqueue',
        samples: float32,
      });
    } catch (err) {
      console.error('[CoachAudio] Playback error:', err);
    }
  }

  public flushPlayer(): void {
    if (this.playerNode) {
      this.playerNode.port.postMessage({ type: 'flush' });
    }
    useAppStore.getState().setCoachSpeaking(false);
  }

  public async startMic(onChunkBase64: (b64: string) => void): Promise<boolean> {
    try {
      await this.ensurePlayer();
      this.stopMic();

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.micContext = new AudioCtx();
      if (this.micContext.state === 'suspended') {
        await this.micContext.resume();
      }

      await this.micContext.audioWorklet.addModule(
        '/audio-worklets/mic-processor.js'
      );
      const source = this.micContext.createMediaStreamSource(this.micStream);
      this.micNode = new AudioWorkletNode(this.micContext, 'mic-processor');

      this.micNode.port.onmessage = (event) => {
        if (event.data?.type === 'pcm16' && event.data.buffer) {
          const b64 = arrayBufferToBase64(event.data.buffer);
          onChunkBase64(b64);
        }
      };

      source.connect(this.micNode);
      useAppStore.getState().setMicActive(true);
      return true;
    } catch (err) {
      console.error('[CoachAudio] Failed to start microphone:', err);
      useAppStore.getState().setMicActive(false);
      return false;
    }
  }

  public stopMic(): void {
    if (this.micNode) {
      this.micNode.port.onmessage = null;
      this.micNode.disconnect();
      this.micNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micContext) {
      this.micContext.close().catch(() => {});
      this.micContext = null;
    }
    useAppStore.getState().setMicActive(false);
  }
}

export const coachAudio = new CoachAudioManager();
