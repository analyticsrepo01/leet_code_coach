import { useAppStore } from '../store';

class ScreenShareManager {
  private stream: MediaStream | null = null;
  private intervalId: any = null;
  private videoEl: HTMLVideoElement | null = null;

  public async start(onFrameBase64: (jpegB64: string) => void): Promise<boolean> {
    try {
      this.stop();
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 2, max: 5 } },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = this.stream;
      video.muted = true;
      await video.play();
      this.videoEl = video;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      this.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        this.stop();
      });

      this.intervalId = setInterval(() => {
        if (!video.videoWidth || !video.videoHeight || !ctx) return;
        const scale = Math.min(1, 1024 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const b64 = dataUrl.split(',')[1];
        if (b64) {
          onFrameBase64(b64);
        }
      }, 1000);

      useAppStore.getState().setScreenShareActive(true);
      return true;
    } catch (err) {
      console.error('[ScreenShare] Could not start screen share:', err);
      useAppStore.getState().setScreenShareActive(false);
      return false;
    }
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    useAppStore.getState().setScreenShareActive(false);
  }
}

export const screenShare = new ScreenShareManager();
