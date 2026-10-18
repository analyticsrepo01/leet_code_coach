import styles from './gemini-avatar.css?inline';
import {AVATAR_PRESETS} from '../core/constants';
import {GeminiLiveClient} from '../core/gemini-live-client';
import {MediaManager} from './media-manager';
import {vertexShaderSource, fragmentShaderSource} from './shaders';
import {initWebGL, detectKeyColor, renderWebGLFrame} from './webgl-helpers';
import {populateDevices} from '../demo/ui-helpers';

export class GeminiAvatar extends HTMLElement {
  private client: GeminiLiveClient | null = null;
  private mediaManager: MediaManager | null = null;

  private accessToken: string | null = null;

  // WebGL
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private glProgram: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private glTexture: WebGLTexture | null = null;
  private audioGainNode: GainNode | null = null;
  private playbackAudioContext: AudioContext | null = null;

  // State
  private isRecordingVideo = false;
  private isMuted = false;
  private isRecording = false; // For mic
  private isMicMuted = false;
  private selectedAudioDeviceId = '';
  private selectedVideoDeviceId = '';
  private selectedSpeakerDeviceId = '';
  private receivedFirstVideoFrame = false;
  private chromaKeyLoopId: number | null = null;
  private resizeListener: (() => void) | null = null;

  private transcriptionStartTime: number | null = null;
  private videoGenerationLatency: number | null = null;
  private videoGenerationLatencies: number[] = [];
  private lastPacketTime = 0;
  private averageInterval = 0;
  private packetJitter = 0;
  private packetCount = 0;
  public currentPosition: any = null;

  // UI Elements
  private container!: HTMLDivElement;
  private videoEl!: HTMLVideoElement;
  private previewImg!: HTMLImageElement;
  private audioAnim!: HTMLDivElement;
  private micBtn!: HTMLButtonElement;
  private camBtn!: HTMLButtonElement;
  private screenBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private snapshotBtn!: HTMLButtonElement;
  private settingsBtn!: HTMLButtonElement;
  private settingsModal!: HTMLDivElement;
  private displayCanvas: HTMLCanvasElement | null = null;
  private transcriptArea: HTMLDivElement | null = null;
  private chatContainer: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private samplingCanvas: HTMLCanvasElement | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private maskTexture: WebGLTexture | null = null;

  // Statistics
  private startTime: number | null = null;
  private setupCompleteTime: number | null = null;
  private firstFrameTime: number | null = null;
  private chromaKeyDurationMs = 0;

  private isStreamingCamera = false;
  private isStreamingScreen = false;

  public customAvatar: {image_data: string; image_mime_type: string} | null =
    null;
  public customVoice: {
    voiceSampleAudio: string;
    consentAudio?: string;
    mimeType: string;
  } | null = null;

  constructor() {
    super();
    this.attachShadow({mode: 'open'});
  }

  connectedCallback() {
    this.render();

    const webgl = initWebGL(
      this.displayCanvas!,
      vertexShaderSource,
      fragmentShaderSource,
      (msg, data, imp) => this._log(msg, data, imp),
    );
    if (webgl) {
      this.gl = webgl.gl;
      this.glProgram = webgl.program;
      this.positionBuffer = webgl.positionBuffer;
      this.texCoordBuffer = webgl.texCoordBuffer;
      this.glTexture = webgl.glTexture;
      this.maskTexture = webgl.maskTexture;
    }
    const autoRequest = this.getAttribute('mic-auto-request') !== 'false';
    if (autoRequest) {
      this.checkMicPermission().then(state => {
        this._log('Mic permission state on load:', state);
        if (state === 'granted') {
          const audioChunkSize =
            this.getAttribute('audio-chunk-size') || '2048';
          this.mediaManager?.startMic(audioChunkSize).then(started => {
            if (started) this.isRecording = true;
          });
        } else if (state === 'denied') {
          this.isRecording = false;
          this.isMicMuted = true;
        }
      });
    }
    this.updateSize(this.getAttribute('size') || '300px');
    this.updatePosition(this.getAttribute('position') || 'top-right');
    this.setPreview(this.getAttribute('avatar-name') || 'Kira');

    if (this.getAttribute('send-location') === 'true') {
      this.checkLocationAndPermission();
    }

    this.resizeListener = () => {
      this.updateSize(this.getAttribute('size') || '300px');
      this.updatePosition(this.getAttribute('position') || 'top-right');
    };
    window.addEventListener('resize', this.resizeListener);
  }

  disconnectedCallback() {
    this.stop();
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    this.shadowRoot.appendChild(styleEl);

    this.container = document.createElement('div');
    this.container.id = 'container';

    this.videoEl = document.createElement('video');
    this.videoEl.id = 'avatar-video';
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    this.videoEl.muted = false; // Unmuted by default

    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.id = 'avatar-canvas';
    this.displayCanvas.style.display = 'none'; // Hidden by default
    this.container.appendChild(this.displayCanvas);
    this.container.appendChild(this.videoEl);

    this.transcriptArea = document.createElement('div');
    this.transcriptArea.id = 'transcript-area';
    this.transcriptArea.style.display = 'none'; // Hidden by default
    this.container.appendChild(this.transcriptArea);

    this.chatContainer = document.createElement('div');
    this.chatContainer.id = 'chat-container';
    this.chatContainer.style.display = 'none'; // Hidden by default

    this.chatInput = document.createElement('input');
    this.chatInput.id = 'chat-input';
    this.chatInput.placeholder = 'Type a message...';
    this.chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const text = this.chatInput!.value;
        if (text) {
          this.sendMessage(text);
          this.chatInput!.value = '';
        }
      }
    });

    this.chatContainer.appendChild(this.chatInput);
    this.container.appendChild(this.chatContainer);

    this.previewImg = document.createElement('img');
    this.previewImg.id = 'preview-image';
    this.container.appendChild(this.previewImg);

    this.audioAnim = document.createElement('div');
    this.audioAnim.className = 'audio-animation';
    this.audioAnim.innerHTML = `
      <div class="waves">
        <div class="wave"></div>
        <div class="wave"></div>
        <div class="wave"></div>
        <svg viewBox="0 0 24 24" style="width: 40px; height: 40px; fill: #38bdf8; z-index: 2;"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
      </div>
    `;
    this.container.appendChild(this.audioAnim);

    // Debug events
    this.videoEl.onplaying = () => {
      this._log('Video element playing');
      if (this.receivedFirstVideoFrame) {
        this.previewImg.style.display = 'none';
      }
    };
    this.videoEl.onpause = () => this._log('Video element paused');
    this.videoEl.onerror = () =>
      this._log('Video element error', {error: this.videoEl.error}, true);
    this.videoEl.onwaiting = () => this._log('Video element waiting');

    const controls = document.createElement('div');
    controls.className = 'controls';

    this.micBtn = this.createButton(
      'Toggle Microphone',
      '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
      () => this.toggleMic(),
    );
    controls.appendChild(this.micBtn);

    this.camBtn = this.createButton(
      'Toggle Camera',
      '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
      () => this.toggleCamera(),
    );
    this.camBtn.classList.add('off');
    controls.appendChild(this.camBtn);

    this.screenBtn = this.createButton(
      'Toggle Screen Share',
      '<svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/><path d="M12 9l-4 4h3v3h2v-3h3z"/></svg>',
      () => this.toggleScreenShare(),
    );
    this.screenBtn.classList.add('off');
    controls.appendChild(this.screenBtn);

    this.muteBtn = this.createButton(
      'Toggle Mute',
      '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.03z"/></svg>',
      () => this.toggleMute(),
    );
    controls.appendChild(this.muteBtn);

    this.snapshotBtn = this.createButton(
      'Save Frame as WebP',
      '<svg viewBox="0 0 24 24"><path d="M21 19H3c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2h4.17l1.83-2h6l1.83 2H21c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2zm-9-2c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0-8c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>',
      () => this.saveFrame(),
    );
    controls.appendChild(this.snapshotBtn);

    this.settingsBtn = this.createButton(
      'Settings',
      '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.483.483 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
      () => this.toggleSettings(),
    );
    controls.appendChild(this.settingsBtn);

    this.settingsModal = document.createElement('div');
    this.settingsModal.className = 'settings-modal';
    this.settingsModal.innerHTML = `
      <h3>Device Settings</h3>
      <label for="audioDeviceSelect">Microphone</label>
      <select id="audioDeviceSelect"></select>
      <label for="videoDeviceSelect">Camera</label>
      <select id="videoDeviceSelect"></select>
      <label for="speakerDeviceSelect">Speaker</label>
      <select id="speakerDeviceSelect"></select>
    `;
    this.container.appendChild(this.settingsModal);

    const closeBtn = this.settingsModal.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleSettings());
    }

    this.updateControlsVisibility(
      this.getAttribute('visible-controls') ||
        'mic,camera,screen,mute,settings',
    );

    this.container.appendChild(controls);
    this.shadowRoot.appendChild(this.container);

    this.mediaManager = new MediaManager(this.videoEl);
    this.mediaManager.onAudioChunk = base64 => this.client?.sendAudio(base64);
    this.mediaManager.onVideoFrame = base64 => this.client?.sendVideo(base64);
    this.mediaManager.onFirstFrame = () => {
      this.receivedFirstVideoFrame = true;
      this.firstFrameTime = new Date().getTime();
      this.previewImg.style.display = 'none';
    };
    this.mediaManager.onLog = (msg, data, imp) => this._log(msg, data, imp);

    // Auto-detect iOS/Safari and use mpegts fallback (MediaSource not supported)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const needsFallback = isIOS || (isSafari && !('MediaSource' in window));

    const useMpegts = this.getAttribute('use-mpegts') === 'true' || needsFallback;

    if (needsFallback) {
      this._log('iOS/Safari detected - using mpegts.js fallback player', {isIOS, isSafari}, true);
    }

    this.mediaManager.init(useMpegts);
    this.updateLayout();
  }

  private async checkLocationAndPermission() {
    if (this.getAttribute('send-location') !== 'true') return;
    try {
      const permission = await navigator.permissions.query({
        name: 'geolocation' as PermissionName,
      });
      if (permission.state === 'denied') {
        this._log('Geolocation permission was denied.', null, true);
        return;
      }
      return new Promise<void>(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            this.currentPosition = pos;
            this._log('Location fetched inside GeminiAvatar:', pos);
            resolve();
          },
          err => {
            console.error('Error fetching location inside GeminiAvatar:', err);
            resolve();
          },
        );
      });
    } catch (e) {
      console.error('Error checking location inside GeminiAvatar:', e);
    }
  }

  private updateLayout() {
    const showTranscript = this.getAttribute('enable-transcript') === 'true';
    const showChat = this.getAttribute('enable-chat-input') === 'true';
    const renderOutside =
      this.getAttribute('render-transcript-outside') === 'true';

    const isTranscriptVisible = showTranscript && !renderOutside;
    const isChatVisible = showChat && !renderOutside;

    if (this.transcriptArea) {
      this.transcriptArea.style.display = isTranscriptVisible ? 'flex' : 'none';
    }
    if (this.chatContainer) {
      this.chatContainer.style.display = isChatVisible ? 'flex' : 'none';
    }

    if (isTranscriptVisible) {
      if (isChatVisible) {
        this.transcriptArea!.style.bottom = '95px';
      } else {
        this.transcriptArea!.style.bottom = '60px';
      }
    }
  }

  private updateControlsVisibility(visibleControls: string) {
    const list = visibleControls.split(',').map(s => s.trim());
    if (this.micBtn)
      this.micBtn.style.display = list.includes('mic') ? '' : 'none';
    if (this.camBtn)
      this.camBtn.style.display = list.includes('camera') ? '' : 'none';
    if (this.screenBtn)
      this.screenBtn.style.display = list.includes('screen') ? '' : 'none';
    if (this.muteBtn)
      this.muteBtn.style.display = list.includes('mute') ? '' : 'none';
    if (this.snapshotBtn)
      this.snapshotBtn.style.display = list.includes('snapshot') ? '' : 'none';
    if (this.settingsBtn)
      this.settingsBtn.style.display = list.includes('settings') ? '' : 'none';
  }

  private createButton(
    title: string,
    iconSVG: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = iconSVG;
    btn.title = title;
    btn.onclick = onClick;
    return btn;
  }

  private toggleSettings() {
    const isActive = this.settingsModal.classList.toggle('active');
    this.settingsBtn.classList.toggle('off', isActive);
    if (isActive) {
      this.populateDevices();
    }
  }

  private async populateDevices() {
    const result = await populateDevices(
      this.settingsModal,
      this.selectedAudioDeviceId,
      this.selectedVideoDeviceId,
      this.selectedSpeakerDeviceId,
      id => this.updateSpeakerDevice(id),
    );
    this.selectedAudioDeviceId = result.selectedAudioDeviceId;
    this.selectedVideoDeviceId = result.selectedVideoDeviceId;
    this.selectedSpeakerDeviceId = result.selectedSpeakerDeviceId;
  }

  private async updateSpeakerDevice(deviceId: string) {
    this._log('Updating speaker device to:', deviceId);
    if (this.videoEl && (this.videoEl as any).setSinkId) {
      try {
        await (this.videoEl as any).setSinkId(deviceId);
        this._log('Speaker device updated for video element');
      } catch (e) {
        console.error('Failed to setSinkId on video element:', e);
      }
    }
    if (
      this.playbackAudioContext &&
      (this.playbackAudioContext as any).setSinkId
    ) {
      try {
        await (this.playbackAudioContext as any).setSinkId(deviceId);
        this._log('Speaker device updated for AudioContext');
      } catch (e) {
        console.error('Failed to setSinkId on AudioContext:', e);
      }
    }
  }

  private _log(message: string, data: any = null, isImportant = false) {
    const debug = this.getAttribute('debug') === 'true';
    if (debug || isImportant) {
      console.log(message, data);
      this.dispatchEvent(
        new CustomEvent('avatar-log', {
          detail: {message, data, timestamp: new Date().toISOString()},
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  static get observedAttributes() {
    return [
      'project-id',
      'location',
      'avatar-name',
      'model',
      'size',
      'position',
      'access-token',
      'record-video',
      'debug',
      'voice',
      'language',
      'output-mode',
      'mic-auto-request',
      'visible-controls',
      'audio-chunk-size',
      'system-instruction',
      'default-greeting',
      'custom-avatar-url',
      'custom-voice-data',
      'custom-voice-consent',
      'chroma-key-color',
      'enable-chroma-key',
      'background-color',
      'enable-transcript',
      'enable-chat-input',
      'render-transcript-outside',
      'enable-grounding',
      'enable-session-resumption',
      'record-user-audio',
      'send-location',
    ];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;

    switch (name) {
      case 'debug':
        this._log(
          `Debug logging ${newValue === 'true' ? 'enabled' : 'disabled'}`,
          null,
          true,
        );
        break;
      case 'record-video':
        this.isRecordingVideo = newValue === 'true';
        this.mediaManager?.setRecordingVideo(this.isRecordingVideo);
        this._log(
          `Video recording ${this.isRecordingVideo ? 'enabled' : 'disabled'}`,
        );
        break;
      case 'record-user-audio':
        this._log(
          `Audio recording ${newValue === 'true' ? 'enabled' : 'disabled'}`,
        );
        break;
      case 'access-token':
        this.accessToken = newValue;
        break;
      case 'size':
        this.updateSize(newValue);
        break;
      case 'position':
        this.updatePosition(newValue);
        break;
      case 'avatar-name':
        this.setPreview(newValue);
        break;
      case 'custom-avatar-url':
        this.setPreview(this.getAttribute('avatar-name') || 'Kira');
        if (newValue && newValue.startsWith('data:')) {
          const parts = newValue.split(',');
          const mimePart = parts[0];
          const base64Data = parts[1];
          const mimeType = mimePart.split(';')[0].split(':')[1];

          // Keep full mime type (e.g., 'image/jpeg', 'image/png')
          this.customAvatar = {
            image_data: base64Data,
            image_mime_type: mimeType,
          };
          this._log('✅ CUSTOM AVATAR SET - Will generate AI avatar from image!', {
            fullMimeType: mimeType,
            base64Length: base64Data.length,
            firstChars: base64Data.substring(0, 50)
          }, true);
        } else {
          this.customAvatar = null;
          this._log('⚠️ Custom avatar URL invalid or cleared', {value: newValue}, true);
        }
        break;
      case 'custom-voice-data':
        if (newValue && newValue.startsWith('data:')) {
          const parts = newValue.split(',');
          const mimePart = parts[0];
          const base64Data = parts[1];
          const mimeType = mimePart.split(';')[0].split(':')[1];

          if (this.customVoice) {
            this.customVoice.voiceSampleAudio = base64Data;
            this.customVoice.mimeType = mimeType;
          } else {
            this.customVoice = {
              voiceSampleAudio: base64Data,
              mimeType: mimeType,
            };
          }
          this._log('Updated custom voice data', {mimeType});
        } else {
          this.customVoice = null;
        }
        break;
      case 'custom-voice-consent':
        if (newValue && newValue.startsWith('data:')) {
          const parts = newValue.split(',');
          const base64Data = parts[1];

          if (this.customVoice) {
            this.customVoice.consentAudio = base64Data;
          } else {
            this.customVoice = {
              voiceSampleAudio: '',
              consentAudio: base64Data,
              mimeType: 'audio/wav',
            };
          }
          this._log('Updated custom voice consent data');
        } else {
          if (this.customVoice) {
            this.customVoice.consentAudio = undefined;
          }
        }
        break;
      case 'visible-controls':
        this.updateControlsVisibility(newValue);
        break;
      case 'mic-auto-request':
        if (newValue === 'true' && !this.isRecording) {
          const audioChunkSize =
            this.getAttribute('audio-chunk-size') || '2048';
          this.mediaManager?.startMic(audioChunkSize).then(started => {
            if (started) this.isRecording = true;
          });
        }
        break;
      case 'enable-transcript':
      case 'enable-chat-input':
      case 'render-transcript-outside':
        this.updateLayout();
        break;
      case 'enable-chroma-key':
      case 'background-color':
        this.updateChromaKeyState();
        break;
      case 'send-location':
        if (newValue === 'true') {
          this.checkLocationAndPermission();
        }
        break;
    }
  }

  public setPreview(avatarName: string) {
    if (!this.previewImg) return;

    const enabled = this.getAttribute('enable-chroma-key') === 'true';
    const bgColor = this.getAttribute('background-color');
    const shouldChromaKey = enabled || bgColor === 'transparent';

    // ALWAYS check for custom avatar URL first - takes priority over presets
    const customUrl = this.getAttribute('custom-avatar-url');
    if (customUrl) {
      this.previewImg.src = customUrl;
      this.previewImg.style.display = shouldChromaKey ? 'none' : 'block';
      this.updateChromaKeyState();
      this._log('Using custom avatar image', null, true);
      return;
    }

    if (avatarName === 'AudioOnly' || avatarName === 'Custom') {
      this.previewImg.style.display = 'none';
      return;
    }

    const preset = (AVATAR_PRESETS as any)[avatarName];
    const url = preset ? preset.image : null;
    if (url) {
      this.previewImg.src = url;
      this.previewImg.style.display = shouldChromaKey ? 'none' : 'block';
    } else {
      this.previewImg.style.display = 'none';
    }
    this.updateChromaKeyState();
  }

  private updateSize(size: string) {
    if (!this.container) return;

    const maxH = window.innerHeight - 40;
    const maxW = window.innerWidth - 40;
    const aspectRatio = 1280 / 704;

    let w: number;
    let h: number;

    if (size === 'fill') {
      w = maxW;
      h = w * aspectRatio;
      if (h > maxH) {
        h = maxH;
        w = h / aspectRatio;
      }
    } else {
      w = parseFloat(size) || 300;
      h = w * aspectRatio;

      if (h > maxH) {
        h = maxH;
        w = h / aspectRatio;
      }
      if (w > maxW) {
        w = maxW;
        h = w * aspectRatio;
      }
    }

    this.style.width = `${w}px`;
    this.style.height = `${h}px`;
  }

  private updatePosition(pos: string) {
    const parts = pos.split('-');
    this.style.top = parts.includes('top') ? '20px' : 'auto';
    this.style.bottom = parts.includes('bottom') ? '20px' : 'auto';

    if (parts.includes('middle')) {
      this.style.left = '50%';
      this.style.right = 'auto';
      this.style.transform = 'translateX(-50%)';
    } else {
      this.style.left = parts.includes('left') ? '20px' : 'auto';
      this.style.right = parts.includes('right') ? '20px' : 'auto';
      this.style.transform = 'none';
    }
  }

  public sendToolResponse(functionResponses: any[]) {
    this.client?.sendToolResponse(functionResponses);
  }

  // Public API
  public async start(externalStream?: MediaStream, micStream?: MediaStream) {
    this._log('Starting session...');

    // Reset mic mute state based on attribute
    const autoRequest = this.getAttribute('mic-auto-request') !== 'false';
    if (autoRequest) {
      this.isMicMuted = false;
      if (this.micBtn) this.micBtn.classList.remove('off');
      if (!this.isRecording) {
        const audioChunkSize = this.getAttribute('audio-chunk-size') || '2048';
        const started = await this.mediaManager?.startMic(
          audioChunkSize,
          externalStream,
          micStream,
        );
        if (started) {
          this.isRecording = true;
        }
      }
    } else {
      this.isMicMuted = true;
      if (this.micBtn) this.micBtn.classList.add('off');
    }

    this.mediaManager?.setRecordingVideo(this.isRecordingVideo);

    await this.tryConnect();
  }

  public stop() {
    this._log('Stopping session...');

    this.mediaManager?.stopRecording();
    this.mediaManager?.stopVideoStreaming();
    this.mediaManager?.resetMediaSource();
    this.receivedFirstVideoFrame = false;
    this.isRecording = false;
    this.updateChromaKeyState();
    this.disconnect();
  }

  public mute() {
    this.isMuted = true;
    if (this.audioGainNode) {
      this.audioGainNode.gain.value = 0;
    }
    if (this.videoEl) {
      this.videoEl.muted = true;
    }
    if (this.muteBtn) this.muteBtn.classList.add('off');
  }

  public unmute() {
    this.isMuted = false;
    if (!this.playbackAudioContext) {
      this.playbackAudioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      this.audioGainNode = this.playbackAudioContext.createGain();
      this.audioGainNode.connect(this.playbackAudioContext.destination);
    }
    this.audioGainNode!.gain.value = 1;
    if (this.playbackAudioContext!.state === 'suspended') {
      this.playbackAudioContext!.resume();
    }
    if (this.videoEl) {
      this.videoEl.muted = false;
    }
    if (this.muteBtn) this.muteBtn.classList.remove('off');
  }

  public sendMessage(text: string) {
    this.client?.sendText(text);
    this.appendTranscript('User', text);
  }

  public getAudioOutputStream(): MediaStream {
    if (!this.mediaManager) {
      throw new Error('MediaManager not initialized');
    }
    return this.mediaManager.getAudioOutputStream();
  }

  public updateExternalStream(stream: MediaStream | null) {
    this.mediaManager?.updateExternalStream(stream);
  }

  public setAudioContext(ctx: AudioContext) {
    this.mediaManager?.setAudioContext(ctx);
  }

  public getStats() {
    const now = new Date().getTime();
    const setupDurationMs =
      this.setupCompleteTime && this.startTime
        ? this.setupCompleteTime - this.startTime
        : null;
    const setupToFirstFrameDurationMs =
      this.firstFrameTime && this.setupCompleteTime
        ? this.firstFrameTime - this.setupCompleteTime
        : null;

    const sessionStart = this.firstFrameTime || this.setupCompleteTime;
    const sessionDurationMs = sessionStart ? now - sessionStart : null;

    const conn =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;
    const networkInfo = conn
      ? {
          downlink: conn.downlink,
          rtt: conn.rtt,
          type: conn.type,
        }
      : null;

    const clientStats = this.client ? this.client.getStats() : null;

    const sorted = [...this.videoGenerationLatencies].sort((a, b) => a - b);
    const getPercentile = (p: number) => {
      if (sorted.length === 0) return null;
      const idx = Math.floor((p / 100) * sorted.length);
      return sorted[idx];
    };
    const p50 = getPercentile(50);
    const p95 = getPercentile(95);
    const p99 = getPercentile(99);

    return {
      setupDurationMs,
      setupToFirstFrameDurationMs,
      sessionDurationMs,
      networkInfo,
      chromaKeyDurationMs: this.chromaKeyDurationMs,
      videoGenerationLatency: this.videoGenerationLatency,
      p50,
      p95,
      p99,
      packetJitter: this.packetJitter,

      // Packet stats from client
      packetsReceived: clientStats ? clientStats.totalPacketsReceived : 0,
      audioPacketsReceived: clientStats ? clientStats.audioPacketsReceived : 0,
      videoPacketsReceived: clientStats ? clientStats.videoPacketsReceived : 0,
      textPacketsReceived: clientStats ? clientStats.textPacketsReceived : 0,
      totalPacketsSent: clientStats ? clientStats.totalPacketsSent : 0,
      audioPacketsSent: clientStats ? clientStats.audioPacketsSent : 0,
      videoPacketsSent: clientStats ? clientStats.videoPacketsSent : 0,
      textPacketsSent: clientStats ? clientStats.textPacketsSent : 0,
    };
  }

  public getRecordingData() {
    if (!this.mediaManager) return null;
    return {
      videoChunks: this.mediaManager.getRecordedChunks(),
      micChunks: this.mediaManager.getMicChunks(),
    };
  }

  public get isConnected(): boolean {
    return this.client !== null && this.client.isConnected;
  }

  // Internal implementation details (adapted from original JS)

  private async checkMicPermission(): Promise<PermissionState> {
    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      return result.state;
    } catch {
      return 'prompt';
    }
  }

  private toggleMic() {
    if (!this.isRecording) {
      const audioChunkSize = this.getAttribute('audio-chunk-size') || '2048';
      this.mediaManager?.startMic(audioChunkSize).then(started => {
        if (started) this.isRecording = true;
      });
    } else {
      this.isMicMuted = !this.isMicMuted;
      this.mediaManager?.setMicMuted(this.isMicMuted);
      if (this.micBtn) this.micBtn.classList.toggle('off', this.isMicMuted);
      this._log(this.isMicMuted ? 'Microphone muted' : 'Microphone unmuted');
    }
  }

  private toggleMute() {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  private async toggleCamera() {
    if (this.isStreamingCamera) {
      this.mediaManager?.stopVideoStreaming();
      this.isStreamingCamera = false;
      this.camBtn.classList.add('off');
      return;
    }
    if (this.isStreamingScreen) {
      await this.toggleScreenShare();
    }
    try {
      this._log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({video: true});
      this.mediaManager?.startVideoStreaming(stream);
      this.isStreamingCamera = true;
      this.camBtn.classList.remove('off');
      this._log('Camera streaming started');
    } catch (err) {
      console.error('Failed to get camera:', err);
      this._log('Camera access denied or failed');
    }
  }

  private async toggleScreenShare() {
    if (this.isStreamingScreen) {
      this.mediaManager?.stopVideoStreaming();
      this.isStreamingScreen = false;
      this.screenBtn.classList.add('off');
      return;
    }
    if (this.isStreamingCamera) {
      await this.toggleCamera();
    }
    try {
      this._log('Requesting screen share access...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      this.mediaManager?.startVideoStreaming(stream);
      this.isStreamingScreen = true;
      this.screenBtn.classList.remove('off');
      this._log('Screen sharing started');

      stream.getVideoTracks()[0].onended = () => {
        this.mediaManager?.stopVideoStreaming();
        this.isStreamingScreen = false;
      };
    } catch (err) {
      console.error('Failed to get screen share:', err);
      this._log('Screen share access denied or failed');
    }
  }

  private saveFrame() {
    if (!this.videoEl) return;
    const canvas = document.createElement('canvas');
    canvas.width = this.videoEl.videoWidth;
    canvas.height = this.videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(this.videoEl, 0, 0);
      const dataURL = canvas.toDataURL('image/webp');
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `avatar_snapshot_${new Date().toISOString()}.webp`;
      a.click();
    }
  }

  private async tryConnect() {
    if (!this.accessToken) {
      this._log('No access token available. Cannot connect.', null, true);
      return;
    }
    if (this.client) return;

    this.mediaManager?.resetMediaSource();
    this.mediaManager?.ensurePlaybackAudioSetup();

    this.startTime = null;
    this.setupCompleteTime = null;
    this.firstFrameTime = null;
    this.receivedFirstVideoFrame = false;
    this.videoGenerationLatency = null;
    this.videoGenerationLatencies = [];

    if (this.transcriptArea) {
      this.transcriptArea.innerHTML = '';
    }

    const location = this.getAttribute('location') || 'us-central1';
    const project = this.getAttribute('project-id');

    if (!project) {
      console.error('project-id is required');
      return;
    }

    this.startTime = new Date().getTime();

    // Include currentPosition in systemInstruction if available
    let systemInstruction =
      this.getAttribute('system-instruction') || undefined;
    if (this.getAttribute('send-location') === 'true' && this.currentPosition) {
      const coords = this.currentPosition.coords;
      const locText = `The user's current location is at latitude: ${coords.latitude.toFixed(4)}, longitude: ${coords.longitude.toFixed(4)}.`;
      systemInstruction = systemInstruction
        ? `${systemInstruction}\n${locText}`
        : locText;
    }

    this.client = new GeminiLiveClient({
      projectId: project,
      location: location,
      accessToken: this.accessToken,
      avatarName: this.getAttribute('avatar-name') || 'Kira',
      model:
        this.getAttribute('model') || 'gemini-3.1-flash-live-preview-04-2026',
      voice: this.getAttribute('voice') || 'kore',
      language: this.getAttribute('language') || 'en-US',
      systemInstruction: systemInstruction,
      enableGrounding: this.getAttribute('enable-grounding') === 'true',
      enableTranscript:
        this.getAttribute('enable-transcript') === 'true' ||
        (this as any).enableTranscript === true,
      outputMode:
        (this.getAttribute('output-mode') as 'audio' | 'video') || 'video',
      customAvatar: this.customAvatar,
      customVoice: this.customVoice,
      defaultGreeting: this.getAttribute('default-greeting') || undefined,
      debug: this.getAttribute('debug') === 'true',
      enableSessionResumption:
        this.getAttribute('enable-session-resumption') !== 'false',
      tools: (this as any).tools || undefined,
    });

    this.client.onConnected = () => {
      this.dispatchEvent(new CustomEvent('avatar-connected'));
    };
    this.client.onToolCall = (toolCall: any) => {
      this.dispatchEvent(
        new CustomEvent('tool-call', {
          detail: toolCall,
          bubbles: true,
          composed: true,
        }),
      );
    };
    this.client.onDisconnected = () => {
      this.client = null;
      this.dispatchEvent(new CustomEvent('avatar-disconnected'));
    };
    this.client.onSetupError = error => {
      this.dispatchEvent(
        new CustomEvent('avatar-setup-error', {detail: {error}}),
      );
    };
    this.client.onReconnect = () => {
      this._log('Reconnecting, resetting media source', null, true);
      this.mediaManager?.resetMediaSource();
    };
    this.client.onSetupComplete = () => {
      this.setupCompleteTime = new Date().getTime();
      this.mediaManager?.setSetupComplete(true);
    };
    this.client.onUserTranscript = text => {
      if (this.getAttribute('enable-transcript') === 'true') {
        this.appendTranscript('User', text);
      }
    };
    this.client.onModelTranscript = text => {
      if (!this.transcriptionStartTime) {
        this.transcriptionStartTime = Date.now();
      }
      if (this.getAttribute('enable-transcript') === 'true') {
        this.appendTranscript('Agent', text);
      }
    };

    const handlePacket = () => {
      const now = Date.now();
      if (this.lastPacketTime > 0) {
        const interval = now - this.lastPacketTime;
        this.packetCount++;
        if (this.packetCount === 1) {
          this.averageInterval = interval;
        } else {
          this.averageInterval = this.averageInterval * 0.9 + interval * 0.1;
          this.packetJitter =
            this.packetJitter * 0.9 +
            Math.abs(interval - this.averageInterval) * 0.1;
        }
      }
      this.lastPacketTime = now;
    };

    this.client.onAudioData = base64 => {
      handlePacket();
      this.mediaManager?.playAudioChunk(base64);
    };

    if (this.mediaManager) {
      this.mediaManager.onSpeakingChange = isSpeaking => {
        console.log(
          `[GeminiAvatar] Speaking state change (statistics): ${isSpeaking}`,
        );
        if (isSpeaking && this.transcriptionStartTime) {
          const latency = Date.now() - this.transcriptionStartTime;
          this.videoGenerationLatency = latency;
          this.videoGenerationLatencies.push(latency);
          this.transcriptionStartTime = null; // Reset for next time
          console.log(`[GeminiAvatar] Video generation latency: ${latency}ms`);
        }
        if (!isSpeaking) {
          this.transcriptionStartTime = null;
        }
      };
      this.mediaManager.onVisualSpeakingChange = isSpeaking => {
        this.classList.toggle('speaking', isSpeaking);
      };
    }

    this.client.onVideoData = (base64, mime) => {
      handlePacket();
      this.mediaManager?.handleVideoDataChunk(base64, mime);
    };
    this.client.onVideoChunk = blob =>
      this.mediaManager?.handleVideoChunk(blob);
    this.client.onLog = (msg, data, imp) => this._log(msg, data, imp);

    this.client.connect();
  }

  private disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    this.mediaManager?.stopMic();
    this.mediaManager?.stopVideoStreaming();
  }

  private startChromaKeyLoop() {
    if (this.chromaKeyLoopId) return;

    const loop = () => {
      this.computeFrame();
      this.chromaKeyLoopId = requestAnimationFrame(loop);
    };
    this.chromaKeyLoopId = requestAnimationFrame(loop);
    this._log('Chroma Key loop started');
  }

  private stopChromaKeyLoop() {
    if (this.chromaKeyLoopId) {
      cancelAnimationFrame(this.chromaKeyLoopId);
      this.chromaKeyLoopId = null;
      this._log('Chroma Key loop stopped');
    }
  }

  private updateChromaKeyState() {
    const enabled = this.getAttribute('enable-chroma-key') === 'true';
    const bgColor = this.getAttribute('background-color');
    const chromaKeyColor = this.getAttribute('chroma-key-color');
    const shouldChromaKey =
      (enabled || bgColor === 'transparent') && chromaKeyColor !== 'disabled';

    if (this.displayCanvas)
      this.displayCanvas.style.display = shouldChromaKey ? 'block' : 'none';
    if (this.videoEl)
      this.videoEl.style.display = shouldChromaKey ? 'none' : 'block';

    if (this.previewImg) {
      if (shouldChromaKey) {
        this.previewImg.style.display = 'none';
      } else {
        this.previewImg.style.display = this.receivedFirstVideoFrame
          ? 'none'
          : 'block';
      }
    }

    if (shouldChromaKey) {
      this.startChromaKeyLoop();
    } else {
      this.stopChromaKeyLoop();
    }
  }

  private computeFrame() {
    if (!this.videoEl || !this.displayCanvas) return;

    if (typeof this.displayCanvas.getContext !== 'function') return;

    const startTime = performance.now();

    let source: TexImageSource | null = null;
    let width = 0;
    let height = 0;

    if (
      !this.receivedFirstVideoFrame &&
      this.previewImg &&
      this.previewImg.complete &&
      this.previewImg.naturalWidth > 0
    ) {
      width = this.previewImg.naturalWidth;
      height = this.previewImg.naturalHeight;
      source = this.previewImg;
    } else if (this.videoEl && this.videoEl.videoWidth > 0) {
      width = this.videoEl.videoWidth;
      height = this.videoEl.videoHeight;
      source = this.videoEl;
    }

    if (width === 0 || height === 0 || !source) return;

    // Update canvas size (force to 704x1280)
    const targetWidth = 704;
    const targetHeight = 1280;
    if (this.displayCanvas.width !== targetWidth) {
      this.displayCanvas.width = targetWidth;
      this.displayCanvas.height = targetHeight;
    }

    // Fallback to 2D context if WebGL failed
    if (!this.gl || !this.glProgram) {
      const ctx = this.displayCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          source as any,
          0,
          0,
          width,
          height,
          0,
          0,
          targetWidth,
          targetHeight,
        );
      }
      return;
    }

    const gl = this.gl;
    const program = this.glProgram;

    // --- CPU Dynamic Detection ---
    const chromaKeyColor = this.getAttribute('chroma-key-color') || 'green';
    const isBlueMode =
      chromaKeyColor === 'blue' || chromaKeyColor === '#0047bb';

    const keyColor = detectKeyColor(
      source,
      width,
      height,
      isBlueMode,
      this.samplingCanvas,
    );

    // --- Mask Generation ---
    const maskW = 44;
    const maskH = 80;
    if (!this.maskCanvas) {
      this.maskCanvas = document.createElement('canvas');
      this.maskCanvas.width = maskW;
      this.maskCanvas.height = maskH;
      this.maskCtx = this.maskCanvas.getContext('2d', {
        willReadFrequently: true,
      });
    }

    const maskData = new Uint8Array(maskW * maskH);
    maskData.fill(255); // Default to foreground

    const toleranceAttr = this.getAttribute('chroma-key-tolerance');
    const tolerance = toleranceAttr ? parseInt(toleranceAttr) : 50;

    if (this.maskCtx) {
      this.maskCtx.drawImage(
        source as any,
        0,
        0,
        width,
        height,
        0,
        0,
        maskW,
        maskH,
      );
      const frameData = this.maskCtx.getImageData(0, 0, maskW, maskH);
      const data = frameData.data;

      const stack: number[] = [];
      const visited = new Uint8Array(maskW * maskH);

      // Add corners to stack
      const corners = [0, maskW - 1, (maskH - 1) * maskW, maskH * maskW - 1];
      for (const idx of corners) {
        stack.push(idx);
        visited[idx] = 1;
      }

      const tol = tolerance * 1.2; // Relaxed tolerance for rough outline

      while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % maskW;
        const y = Math.floor(idx / maskW);

        const r = data[idx * 4 + 0];
        const g = data[idx * 4 + 1];
        const b = data[idx * 4 + 2];

        const isBackground =
          Math.abs(r - keyColor.r) < tol &&
          Math.abs(g - keyColor.g) < tol &&
          Math.abs(b - keyColor.b) < tol;

        if (isBackground || corners.includes(idx)) {
          maskData[idx] = 0; // Background

          const neighbors = [];
          if (x > 0) neighbors.push(idx - 1);
          if (x < maskW - 1) neighbors.push(idx + 1);
          if (y > 0) neighbors.push(idx - maskW);
          if (y < maskH - 1) neighbors.push(idx + maskW);

          for (const n of neighbors) {
            if (!visited[n]) {
              visited[n] = 1;
              stack.push(n);
            }
          }
        }
      }
    }

    // --- Mask Blurring ---
    const blurredMask = new Uint8Array(maskW * maskH);
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        const idx = y * maskW + x;
        if (x === 0 || x === maskW - 1 || y === 0 || y === maskH - 1) {
          blurredMask[idx] = maskData[idx];
          continue;
        }

        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += maskData[(y + ky) * maskW + (x + kx)];
          }
        }
        blurredMask[idx] = Math.round(sum / 9);
      }
    }
    maskData.set(blurredMask);

    // --- WebGL Rendering ---
    const bgColor = this.getAttribute('background-color') || 'transparent';
    const enabled = this.getAttribute('enable-chroma-key') === 'true';

    renderWebGLFrame(
      gl,
      program,
      source,
      width,
      height,
      targetWidth,
      targetHeight,
      keyColor,
      tolerance,
      bgColor === 'transparent',
      enabled,
      this.positionBuffer!,
      this.texCoordBuffer!,
      this.glTexture!,
      this.maskTexture!,
      maskData,
      maskW,
      maskH,
    );
    this.chromaKeyDurationMs = performance.now() - startTime;
  }

  private appendTranscript(sender: string, text: string) {
    // Always fire event for external rendering
    this.dispatchEvent(
      new CustomEvent('transcript-item', {detail: {sender, text}}),
    );

    if (!this.transcriptArea) return;

    const lastChild = this.transcriptArea.lastElementChild;
    if (lastChild && lastChild.getAttribute('data-sender') === sender) {
      lastChild.innerHTML += ' ' + text;
    } else {
      const p = document.createElement('p');
      p.setAttribute('data-sender', sender);
      p.style.margin = '5px 0';
      p.style.fontSize = '0.95rem';
      p.style.padding = '5px 10px';
      p.style.borderRadius = '8px';
      p.style.maxWidth = '80%';
      p.style.wordBreak = 'break-word';

      const isUser = sender === 'User';
      const icon = isUser ? '👤' : '🤖';

      p.innerHTML = `<span>${icon}</span> ${text}`;

      if (isUser) {
        p.style.alignSelf = 'flex-end';
        p.style.background = 'rgba(99, 102, 241, 0.3)';
        p.style.marginLeft = 'auto';
        p.style.color = '#f8fafc';
      } else {
        p.style.alignSelf = 'flex-start';
        p.style.background = 'rgba(255, 255, 255, 0.1)';
        p.style.marginRight = 'auto';
        p.style.color = '#cbd5e1';
      }

      this.transcriptArea.appendChild(p);
    }

    // Scroll to bottom
    this.transcriptArea.scrollTop = this.transcriptArea.scrollHeight;
  }
}

customElements.define('gemini-avatar', GeminiAvatar);
