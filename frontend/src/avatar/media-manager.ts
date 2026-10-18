import mpegts from 'mpegts.js';

export class MediaManager {
  private videoEl: HTMLVideoElement;

  // Playback
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private videoChunkQueue: ArrayBuffer[] = [];
  private playbackAudioContext: AudioContext | null = null;
  private audioGainNode: GainNode | null = null;
  private nextPlaybackTime = 0;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private recordedChunks: ArrayBuffer[] = [];
  private mpegtsPlayer: any = null;
  private customVideoLoader: any = null;
  private receivedBytes = 0;
  private feedVideoData: ((arrayBuffer: ArrayBuffer) => void) | null = null;
  private analyser: AnalyserNode | null = null;
  private speakingInterval: any = null;
  private isSpeaking = false;
  private isSpeakingVisual = false;

  // Input (Mic/Cam/Screen)
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: AudioWorkletNode | null = null;
  private mixer: GainNode | null = null;
  private extSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private videoInputStream: MediaStream | null = null;
  private videoInputInterval: any = null;
  private micChunks: Blob[] = [];

  // State
  private isMuted = false;
  private isMicMuted = false;
  private isRecordingVideo = false;
  private isExternalMicStream = false;
  private isSetupComplete = false;
  private videoAudioSource: MediaElementAudioSourceNode | null = null;
  private pendingExternalStream: MediaStream | null = null;
  private receivedFirstVideoFrame = false;
  private sentFirstAudio = false;
  private isStartingMic = false;

  // Stats counters
  public audioChunksSent = 0;
  public videoFramesSent = 0;
  public videoFramesReceived = 0;
  public packetsReceived = 0; // To be updated by client

  // Callbacks
  onAudioChunk?: (base64Data: string) => void;
  onVideoFrame?: (base64Data: string) => void;
  onFirstFrame?: () => void;
  onLog?: (message: string, data?: any, isImportant?: boolean) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onVisualSpeakingChange?: (isSpeaking: boolean) => void;

  constructor(videoEl: HTMLVideoElement) {
    this.videoEl = videoEl;
  }

  private _log(message: string, data: any = null, isImportant = false) {
    if (this.onLog) {
      this.onLog(message, data, isImportant);
    }
  }

  public setRecordingVideo(value: boolean) {
    this.isRecordingVideo = value;
  }

  public setSetupComplete(value: boolean) {
    this.isSetupComplete = value;
  }

  public setReceivedFirstVideoFrame(value: boolean) {
    this.receivedFirstVideoFrame = value;
  }

  public setMuted(value: boolean) {
    this.isMuted = value;
    if (this.audioGainNode) {
      this.audioGainNode.gain.value = value ? 0 : 1;
    }
    if (this.videoEl) {
      this.videoEl.muted = value;
    }
  }

  public setMicMuted(value: boolean) {
    this.isMicMuted = value;
    if (this.micGain) {
      this.micGain.gain.value = value ? 0 : 1;
    }
  }

  public init(useMpegts: boolean) {
    this.resetMediaSource();
    if (useMpegts) {
      this.initMpegts();
    }
  }

  public ensurePlaybackAudioSetup() {
    if (!this.playbackAudioContext) {
      this.playbackAudioContext =
        this.audioContext ||
        new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 16000,
        });
      this.nextPlaybackTime = this.playbackAudioContext.currentTime;
    }
    if (!this.audioGainNode) {
      this.audioGainNode = this.playbackAudioContext.createGain();
      this.audioGainNode.connect(this.playbackAudioContext.destination);
    }

    if (!this.videoAudioSource && this.videoEl) {
      try {
        this._log(
          'Creating MediaElementSource from video element in setup',
          null,
          true,
        );
        this.videoAudioSource =
          this.playbackAudioContext.createMediaElementSource(this.videoEl);
        this.videoAudioSource.connect(this.playbackAudioContext.destination);
      } catch (e: any) {
        console.error('Failed to create MediaElementSource in setup:', e);
        this._log(
          'Failed to create MediaElementSource in setup',
          {error: e.message},
          true,
        );
      }
    }

    if (!this.analyser) {
      this.analyser = this.playbackAudioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.audioGainNode.connect(this.analyser);

      if (this.videoAudioSource) {
        this.videoAudioSource.connect(this.analyser);
      }
    }
    this.startSpeakingDetection();
  }

  public getAudioOutputStream(): MediaStream {
    this.ensurePlaybackAudioSetup();
    if (this.playbackAudioContext!.state === 'suspended') {
      this.playbackAudioContext!.resume();
      this._log('Resumed playbackAudioContext in getAudioOutputStream');
    }
    if (!this.audioDestination) {
      this.audioDestination =
        this.playbackAudioContext!.createMediaStreamDestination();
      this.audioGainNode!.connect(this.audioDestination);

      try {
        if (this.videoAudioSource) {
          this.videoAudioSource.connect(this.audioDestination);
        } else {
          this._log(
            'videoAudioSource is null in getAudioOutputStream',
            null,
            true,
          );
        }
      } catch (e: any) {
        console.error(
          'Failed to connect videoAudioSource to audioDestination:',
          e,
        );
        this._log(
          'Failed to connect videoAudioSource to audioDestination',
          {error: e.message},
          true,
        );
      }
    }
    return this.audioDestination.stream;
  }

  public setAudioContext(ctx: AudioContext) {
    this.audioContext = ctx;
    this.playbackAudioContext = ctx;
    this._log('Shared AudioContext set in MediaManager');
  }

  public resetMediaSource() {
    if (!this.videoEl) return;
    this._log('Resetting MediaSource');

    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // Ignore error on endOfStream
      }
    }

    this.mediaSource = new MediaSource();
    this.sourceBuffer = null;
    this.videoEl.src = URL.createObjectURL(this.mediaSource);

    if (typeof this.mediaSource.addEventListener === 'function') {
      this.mediaSource.addEventListener('sourceopen', () => {
        this._log('MediaSource opened');
        try {
          const types = [
            'video/mp4; codecs="avc1.42C01E, mp4a.40.2"',
            'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
            'video/mp4; codecs="avc1.64001E, mp4a.40.2"',
            'video/mp4; codecs="avc1.42C01E"',
            'video/mp4; codecs="avc1.42E01E"',
            'video/mp4; codecs="avc1.64001E"',
            'video/mp4',
          ];
          let added = false;
          for (const type of types) {
            if (MediaSource.isTypeSupported(type)) {
              this.sourceBuffer = this.mediaSource!.addSourceBuffer(type);
              this._log('SourceBuffer added successfully', {type});
              added = true;
              break;
            }
          }
          if (!added) {
            throw new Error(
              'None of the common video/mp4 codecs are supported by this browser.',
            );
          }
          this.sourceBuffer!.addEventListener('updateend', () =>
            this.processVideoQueue(),
          );
        } catch (e) {
          console.error('Failed to add SourceBuffer:', e);
        }
      });
    }

    this.recordedChunks = [];
    this.videoChunkQueue = [];
    this.micChunks = [];
    this.nextPlaybackTime = 0;
    this.receivedFirstVideoFrame = false;
    this.sentFirstAudio = false;
    this.isSetupComplete = false;

    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    this.isSpeaking = false;
    this.isSpeakingVisual = false;
  }

  private initMpegts() {
    this._log('Initializing mpegts.js player');
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instance = this;
    this.mpegtsPlayer = mpegts.createPlayer(
      {
        type: 'mpegts',
        isLive: true,
        url: 'custom',
      },
      {
        customLoader: function (this: any) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          this.open = (url: any, range: any) => {};
          this.close = () => {};
          instance.customVideoLoader = this;
        } as any,
      },
    );

    this.mpegtsPlayer.attachMediaElement(this.videoEl);
    this.mpegtsPlayer.on('error', (type: any, detail: any, info: any) => {
      this._log('mpegts error', {type, detail, info});
    });
    this.mpegtsPlayer.load();

    this.receivedBytes = 0;
    this.feedVideoData = (arrayBuffer: ArrayBuffer) => {
      if (this.customVideoLoader && this.customVideoLoader.onData) {
        this.customVideoLoader.onData(arrayBuffer, this.receivedBytes);
        this.receivedBytes += arrayBuffer.byteLength;
      }
    };
  }

  private processVideoQueue() {
    if (
      !this.sourceBuffer ||
      this.sourceBuffer.updating ||
      this.videoChunkQueue.length === 0
    )
      return;
    if (this.mediaSource?.readyState !== 'open') {
      this._log('MediaSource not open, skipping append', {
        readyState: this.mediaSource?.readyState,
      });
      return;
    }
    const chunk = this.videoChunkQueue.shift();
    if (chunk) {
      try {
        this.sourceBuffer.appendBuffer(chunk);
        if (this.videoEl && this.videoEl.paused) {
          this.videoEl
            .play()
            .catch(e =>
              this._log('Auto-play prevented or failed', {error: e.message}),
            );
        }
      } catch (e) {
        console.error('Failed to append buffer:', e);
      }
    }
  }

  public async playAudioChunk(base64Data: string) {
    try {
      this._log(
        'playAudioChunk called',
        {isMuted: this.isMuted, size: base64Data.length},
        true,
      );
      this.ensurePlaybackAudioSetup();

      this.audioGainNode!.gain.value = this.isMuted ? 0 : 1;

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++)
        bytes[i] = binaryString.charCodeAt(i);

      const arrayBuffer = bytes.buffer;
      const pcmData = new Int16Array(arrayBuffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++)
        floatData[i] = pcmData[i] / 32768.0;

      const buffer = this.playbackAudioContext!.createBuffer(
        1,
        floatData.length,
        24000,
      );
      buffer.copyToChannel(floatData, 0);

      const source = this.playbackAudioContext!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioGainNode!);

      const startTime = Math.max(
        this.playbackAudioContext!.currentTime,
        this.nextPlaybackTime,
      );
      source.start(startTime);
      this.nextPlaybackTime = startTime + buffer.duration;
    } catch (e: any) {
      console.error('Failed to play audio chunk:', e);
      this._log('Failed to play audio chunk', {error: e.message}, true);
    }
  }

  private startSpeakingDetection() {
    if (this.speakingInterval) return;
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let silenceStart = 0;

    this.speakingInterval = setInterval(() => {
      this.analyser!.getByteTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / bufferLength);

      const threshold = 0.01; // Close to zero

      if (rms > threshold) {
        if (!this.isSpeakingVisual) {
          this.isSpeakingVisual = true;
          if (this.onVisualSpeakingChange) this.onVisualSpeakingChange(true);
        }
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          console.log(
            `[MediaManager] Speaking started (rms: ${rms.toFixed(4)})`,
          );
          if (this.onSpeakingChange) this.onSpeakingChange(true);
        }
        silenceStart = 0;
      } else {
        if (this.isSpeaking || this.isSpeakingVisual) {
          if (silenceStart === 0) {
            silenceStart = Date.now();
          } else {
            const silenceDuration = Date.now() - silenceStart;

            if (silenceDuration > 500 && this.isSpeakingVisual) {
              this.isSpeakingVisual = false;
              if (this.onVisualSpeakingChange)
                this.onVisualSpeakingChange(false);
            }

            if (silenceDuration > 1000 && this.isSpeaking) {
              this.isSpeaking = false;
              console.log('[MediaManager] Speaking stopped (statistics)');
              if (this.onSpeakingChange) this.onSpeakingChange(false);
            }

            if (!this.isSpeaking && !this.isSpeakingVisual) {
              silenceStart = 0;
            }
          }
        }
      }
    }, 100);
  }

  public async handleVideoDataChunk(base64Data: string, mimeType: string) {
    void mimeType;
    try {
      this.checkFirstFrame();
      this.videoFramesReceived++;

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++)
        bytes[i] = binaryString.charCodeAt(i);

      const arrayBuffer = bytes.buffer;
      if (this.isRecordingVideo) {
        this.recordedChunks.push(arrayBuffer);
        this._log(
          `Collected video chunk: ${arrayBuffer.byteLength} bytes, total: ${this.recordedChunks.length}`,
        );
      }

      if (this.sourceBuffer) {
        this.videoChunkQueue.push(arrayBuffer);
        this.processVideoQueue();
      } else if (this.feedVideoData) {
        this.feedVideoData(arrayBuffer);
      }
    } catch (e: any) {
      console.error('Failed to handle video data chunk:', e);
      this._log('Failed to handle video data chunk', {error: e.message}, true);
    }
  }

  public async handleVideoChunk(blob: Blob) {
    this.checkFirstFrame();
    this.videoFramesReceived++;

    const arrayBuffer = await blob.arrayBuffer();
    if (this.isRecordingVideo) {
      this.recordedChunks.push(arrayBuffer);
      this._log(
        `Collected video chunk (blob): ${arrayBuffer.byteLength} bytes, total: ${this.recordedChunks.length}`,
      );
    }

    if (this.sourceBuffer) {
      this.videoChunkQueue.push(arrayBuffer);
      this.processVideoQueue();
    } else if (this.feedVideoData) {
      this.feedVideoData(arrayBuffer);
    }
  }

  private checkFirstFrame() {
    if (!this.receivedFirstVideoFrame) {
      this.receivedFirstVideoFrame = true;
      this._log('First video frame received!');
      if (this.onFirstFrame) this.onFirstFrame();
    }
  }

  public async startMic(
    audioChunkSize: string = '2048',
    externalStream: MediaStream | null = null,
    micStream: MediaStream | null = null,
  ) {
    if (this.isStartingMic) {
      this._log('Mic is already starting, ignoring');
      return false;
    }
    if (this.processor) {
      this._log('Mic already started, stopping first');
      this.processor.port.onmessage = null;
      this.stopMic();
    }
    this.isStartingMic = true;
    try {
      if (micStream) {
        this.micStream = micStream;
        this.isExternalMicStream = true;
        this._log('Using provided external mic stream', null, true);
      } else {
        this._log('Requesting microphone permission...', null, true);
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        this.isExternalMicStream = false;
        this._log('Microphone permission granted!', null, true);
      }

      if (!this.audioContext) {
        this.audioContext = new (
          window.AudioContext || (window as any).webkitAudioContext
        )({sampleRate: 16000});
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        this._log('Resumed audioContext in startMic');
      }

      this.mixer = this.audioContext.createGain();
      this.micGain = this.audioContext.createGain();
      const micSource = this.audioContext.createMediaStreamSource(
        this.micStream,
      );
      micSource.connect(this.micGain);
      this.micGain.connect(this.mixer);
      this.micGain.gain.value = this.isMicMuted ? 0 : 1;

      if (externalStream) {
        this.extSource =
          this.audioContext.createMediaStreamSource(externalStream);
        this.extSource.connect(this.mixer);
      }

      if (this.pendingExternalStream) {
        this._log('Connecting pending external stream');
        this.extSource = this.audioContext.createMediaStreamSource(
          this.pendingExternalStream,
        );
        this.extSource.connect(this.mixer);
        this.pendingExternalStream = null;
      }

      const bufferSize = parseInt(audioChunkSize);
      const workletCode = `
                class AudioProcessor extends AudioWorkletProcessor {
                    constructor() {
                        super();
                        this.buffer = new Float32Array(${bufferSize});
                        this.offset = 0;
                    }
                    process(inputs, outputs, parameters) {
                        const input = inputs[0];
                        if (input && input[0]) {
                            const inputChannel = input[0];
                            
                            for (let i = 0; i < inputChannel.length; i++) {
                                this.buffer[this.offset++] = inputChannel[i];
                                if (this.offset >= this.buffer.length) {
                                    this.port.postMessage(this.buffer);
                                    this.buffer = new Float32Array(${bufferSize});
                                    this.offset = 0;
                                }
                            }
                        }
                        return true;
                    }
                }
                registerProcessor('audio-processor', AudioProcessor);
            `;

      const dataUri = 'data:text/javascript;base64,' + btoa(workletCode);
      const currentContext = this.audioContext;
      try {
        await this.audioContext.audioWorklet.addModule(dataUri);
        this._log('AudioWorklet module added successfully');
      } catch (e) {
        console.error('Failed to add AudioWorklet module:', e);
        this._log('Failed to add AudioWorklet module', e, true);
        return false;
      }

      if (this.audioContext !== currentContext || !this.audioContext) {
        this._log('Mic start aborted (context changed or cleared)');
        return false;
      }

      this.processor = new AudioWorkletNode(
        this.audioContext,
        'audio-processor',
      );
      this.mixer.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this._log('Microphone started successfully - audio worklet connected', {
        setupComplete: this.isSetupComplete,
        audioChunkSize: bufferSize
      }, true);

      this.processor.port.onmessage = e => {
        if (e.data && e.data.type === 'signal') {
          return;
        }
        const inputData = e.data;
        const pcmData = this.float32ToInt16(inputData);

        const base64Data = this.arrayBufferToBase64(
          pcmData.buffer as ArrayBuffer,
        );

        let didSendAudio = false;
        // For audio-only models, don't wait for video frame
        // Just wait for setup to complete
        if (this.isSetupComplete) {
          if (this.onAudioChunk) {
            this.onAudioChunk(base64Data);
            didSendAudio = true;
            this.sentFirstAudio = true;
            this.audioChunksSent++;
            // Log first few audio chunks for debugging
            if (this.audioChunksSent <= 3) {
              this._log(`Sending audio chunk #${this.audioChunksSent}`, {size: base64Data.length}, true);
            }
          }
        } else if (this.audioChunksSent === 0) {
          this._log('Microphone capturing but setup not complete yet, buffering...', null, true);
        }

        if (this.isRecordingVideo && (this.sentFirstAudio || didSendAudio)) {
          this.micChunks.push(
            new Blob([pcmData.buffer as ArrayBuffer], {type: 'audio/pcm'}),
          );
          this._log(
            `[MediaManager] Pushed mic chunk. Total: ${this.micChunks.length}`,
          );
        }
      };

      this._log('Microphone started');
      return true;
    } catch (e) {
      console.error('Failed to start mic error caught:', e);
      this._log('Failed to start mic', e, true);
      return false;
    } finally {
      this.isStartingMic = false;
    }
  }

  public updateExternalStream(stream: MediaStream | null) {
    this._log('updateExternalStream called', {
      hasStream: !!stream,
      hasContext: !!this.audioContext,
    });
    if (!this.audioContext || !this.mixer) {
      this._log(
        'updateExternalStream: mixer not ready, deferring connection',
        null,
        true,
      );
      this.pendingExternalStream = stream;
      return;
    }

    if (this.extSource) {
      this.extSource.disconnect();
      this.extSource = null;
      this._log('Disconnected previous external source');
    }

    if (stream) {
      this.extSource = this.audioContext.createMediaStreamSource(stream);
      this.extSource.connect(this.mixer);
      this._log('Connected new external source to mixer');
    }
  }

  public stopMic() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mixer) {
      this.mixer.disconnect();
      this.mixer = null;
    }
    if (this.micGain) {
      this.micGain.disconnect();
      this.micGain = null;
    }
    if (this.extSource) {
      this.extSource.disconnect();
      this.extSource = null;
    }

    if (this.micStream) {
      if (!this.isExternalMicStream) {
        if (typeof this.micStream.getTracks === 'function') {
          const tracks = this.micStream.getTracks();
          if (Array.isArray(tracks)) {
            tracks.forEach(track => track.stop());
          }
        }
      }
      this.micStream = null;
    }
    this._log('Microphone stopped');
  }

  public startVideoStreaming(stream: MediaStream) {
    this.videoInputStream = stream;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    this.videoInputInterval = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0 && ctx) {
        canvas.width = Math.min(video.videoWidth, 768);
        canvas.height = (canvas.width * video.videoHeight) / video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        if (this.isSetupComplete) {
          if (this.onVideoFrame) this.onVideoFrame(base64Data);
          this.videoFramesSent++;
        }
      }
    }, 1000);
  }

  public stopVideoStreaming() {
    if (this.videoInputInterval) clearInterval(this.videoInputInterval);
    if (this.videoInputStream)
      this.videoInputStream.getTracks().forEach(track => track.stop());
    this.videoInputStream = null;
    this._log('Video streaming stopped');
  }

  public getRecordedChunks() {
    return this.recordedChunks;
  }

  public getMicStream() {
    return this.micStream;
  }

  public stopRecording() {
    this._log('Microphone recording stopped (no-op)');
  }

  public getMicChunks() {
    return this.micChunks;
  }

  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  }
}
