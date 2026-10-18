
export interface GeminiLiveClientOptions {
  projectId: string;
  location?: string;
  accessToken: string;
  avatarName?: string;
  voice?: string;
  language?: string;
  systemInstruction?: string;
  enableGrounding?: boolean;
  enableTranscript?: boolean;
  outputMode?: 'audio' | 'video';
  customAvatar?: {image_data: string; image_mime_type: string} | null;
  customVoice?: {
    voiceSampleAudio: string;
    consentAudio?: string;
    mimeType: string;
  } | null;
  defaultGreeting?: string;
  debug?: boolean;
  enableSessionResumption?: boolean;
  model?: string;
  tools?: any[];
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private messageQueue: any[] = [];
  private processingQueue = false;
  private isSetupComplete = false;
  private options: GeminiLiveClientOptions;
  private sessionHandle: string | null = null;
  private receivedFirstResponse = false;
  private pendingReconnection = false;
  private sentMessages: Array<{index: number; message: any}> = [];
  private currentMessageIndex = 0;
  private explicitDisconnect = false;

  // Counters
  public totalPacketsReceived = 0;
  public audioPacketsReceived = 0;
  public videoPacketsReceived = 0;
  public textPacketsReceived = 0;
  public totalPacketsSent = 0;
  public audioPacketsSent = 0;
  public videoPacketsSent = 0;
  public textPacketsSent = 0;

  // Callbacks
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReconnect?: () => void;
  onSetupComplete?: () => void;
  onUserTranscript?: (text: string) => void;
  onModelTranscript?: (text: string) => void;
  onAudioData?: (base64Data: string) => void;
  onVideoData?: (base64Data: string, mimeType: string) => void;
  onVideoChunk?: (blob: Blob) => void;
  onLog?: (message: string, data?: any, isImportant?: boolean) => void;
  onSetupError?: (error: any) => void;
  onToolCall?: (toolCall: any) => void;

  constructor(options: GeminiLiveClientOptions) {
    this.options = options;
  }

  private _log(message: string, data: any = null, isImportant = false) {
    if (this.options.debug || isImportant) {
      if (this.onLog) {
        this.onLog(message, data, isImportant);
      } else {
        console.log(message, data);
      }
    }
  }

  public connect() {
    if (this.ws) return;

    this.isSetupComplete = false;

    const location = this.options.location || 'us-central1';
    const project = this.options.projectId;

    if (!project) {
      console.error('project-id is required');
      return;
    }

    const host =
      location === 'global'
        ? 'autopush-aiplatform.sandbox.googleapis.com'
        : `${location}-aiplatform.googleapis.com`;
    const url = `wss://${host}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent?access_token=${this.options.accessToken}`;

    this._log('Connecting to WebSocket...', {url}, true);

    try {
      console.log('Creating WebSocket with URL:', url);
      this.ws = new WebSocket(url);
      console.log('WebSocket created successfully!');

      this.ws.onopen = () => {
        this._log('WebSocket Connected', null, true);
        this.sendSetup();
        if (this.onConnected) this.onConnected();
      };

      this.ws.onmessage = event => this.handleMessage(event);

      this.ws.onerror = error => {
        console.error('WebSocket Error:', error);
        this._log('WebSocket Error', error, true);
      };

      this.ws.onclose = (event: CloseEvent) => {
        this._log(
          `WebSocket Closed (code: ${event.code}, reason: ${event.reason})`,
          null,
          true,
        );
        this.ws = null;

        if (this.explicitDisconnect) {
          this.explicitDisconnect = false;
          if (this.onDisconnected) this.onDisconnected();
          return;
        }

        if (!this.isSetupComplete) {
          this._log('WebSocket closed before setup completion', null, true);
          window.dispatchEvent(
            new CustomEvent('gemini-auth-error', {
              detail: {error: 'WebSocket closed before setup completion'},
            }),
          );
          if (this.onSetupError)
            this.onSetupError(
              new Error('WebSocket closed before setup completion'),
            );
        }

        if (this.shouldResume()) {
          if (this.messageQueue.length > 0 || this.processingQueue) {
            this._log('Queue not empty, delaying reconnection', null, true);
            this.pendingReconnection = true;
          } else {
            this.reconnect();
          }
        } else {
          if (this.onDisconnected) this.onDisconnected();
        }
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      this._log('Failed to create WebSocket', e, true);
    }
  }

  public disconnect() {
    if (this.ws) {
      this.explicitDisconnect = true;
      this.ws.close();
      this.ws = null;
    }
  }

  private sendSetup() {
    const project = this.options.projectId;
    const location = this.options.location || 'us-central1';
    const modelName = this.options.avatarName || 'Kira';
    const model = this.options.model || 'gemini-3.1-flash-live-preview-04-2026';
    const voice = this.options.voice || 'kore';
    const language = this.options.language || 'en-US';
    const systemInstruction = this.options.systemInstruction;
    const enableGrounding = this.options.enableGrounding;

    // Log custom avatar usage
    if (this.options.customAvatar) {
      this._log('🎨 Using CUSTOMIZED AVATAR - AI will generate talking avatar from your image!', {
        mimeType: this.options.customAvatar.image_mime_type,
        dataLength: this.options.customAvatar.image_data.length,
        previewFirst50: this.options.customAvatar.image_data.substring(0, 50)
      }, true);
    } else {
      this._log('📋 Using PRESET avatar', {avatarName: modelName}, true);
    }

    const setupMessage = {
      setup: {
        model: `projects/${project}/locations/${location}/publishers/google/models/${model}`,
        avatarConfig:
          // ALWAYS use customized avatar if provided - takes priority over presets
          this.options.customAvatar
            ? {
                customizedAvatar: this.options.customAvatar,
              }
            : modelName === 'AudioOnly'
            ? undefined
            : {
                avatarName: modelName,
              },
        generationConfig: {
          responseModalities: [
            ...(this.options.outputMode === 'audio' ? ['AUDIO'] : ['VIDEO']),
          ],
          speechConfig: {
            voiceConfig: this.options.customVoice
              ? {
                  replicatedVoiceConfig: {
                    voiceSampleAudio: this.options.customVoice.voiceSampleAudio,
                    consentAudio: this.options.customVoice.consentAudio,
                    mimeType: 'audio/pcm;rate=24000',
                  },
                }
              : {
                  prebuiltVoiceConfig: {voiceName: voice},
                },
            languageCode: language,
          },
        },
        ...(this.options.enableSessionResumption === true
          ? {
              sessionResumption: {
                handle: this.sessionHandle,
                transparent: true,
              },
            }
          : {}),
        ...(systemInstruction
          ? {systemInstruction: {parts: [{text: systemInstruction}]}}
          : {}),
        ...(this.options.tools
          ? {tools: this.options.tools}
          : enableGrounding
          ? {tools: [{googleSearch: {}}]}
          : {}),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };

    this._log('Sending setup', setupMessage, true);
    this.ws?.send(JSON.stringify(setupMessage));
  }

  public sendText(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const message = {
      realtimeInput: {
        text: text,
      },
    };

    this.currentMessageIndex++;
    this.sentMessages.push({index: this.currentMessageIndex, message});

    this.textPacketsSent++;
    this.totalPacketsSent++;

    this.ws.send(JSON.stringify(message));
  }

  public sendAudio(base64Data: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const message = {
      realtimeInput: {
        audio: {mimeType: 'audio/pcm;rate=16000', data: base64Data},
      },
    };

    this.currentMessageIndex++;
    this.sentMessages.push({index: this.currentMessageIndex, message});

    this.audioPacketsSent++;
    this.totalPacketsSent++;

    this.ws.send(JSON.stringify(message));
  }

  public sendVideo(base64Data: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const message = {
      realtimeInput: {video: {mimeType: 'image/jpeg', data: base64Data}},
    };

    this.currentMessageIndex++;
    this.sentMessages.push({index: this.currentMessageIndex, message});

    this.videoPacketsSent++;
    this.totalPacketsSent++;

    this.ws.send(JSON.stringify(message));
  }

  public getStats() {
    return {
      totalPacketsReceived: this.totalPacketsReceived,
      audioPacketsReceived: this.audioPacketsReceived,
      videoPacketsReceived: this.videoPacketsReceived,
      textPacketsReceived: this.textPacketsReceived,
      totalPacketsSent: this.totalPacketsSent,
      audioPacketsSent: this.audioPacketsSent,
      videoPacketsSent: this.videoPacketsSent,
      textPacketsSent: this.textPacketsSent,
    };
  }

  private handleMessage(event: MessageEvent) {
    this.totalPacketsReceived++;
    this.messageQueue.push(event.data);
    this.processQueue();
  }

  private async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;
    while (this.messageQueue.length > 0) {
      const data = this.messageQueue.shift();
      await this.processMessageData(data);
    }
    this.processingQueue = false;

    if (this.pendingReconnection) {
      this.pendingReconnection = false;
      if (this.ws) {
        this._log('Queue empty, closing socket to reconnect', null, true);
        this.ws.close();
      } else {
        this._log(
          'Queue empty, proceeding with delayed reconnection',
          null,
          true,
        );
        this.reconnect();
      }
    }
  }

  private async processMessageData(data: any) {
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        const response = JSON.parse(text);
        this.handleJsonResponse(response);
      } catch {
        // Assume video chunk
        if (this.onVideoChunk) this.onVideoChunk(data);
      }
    } else {
      try {
        const response = JSON.parse(data);
        this.handleJsonResponse(response);
      } catch {
        this._log('Received raw text response', data);
      }
    }
  }

  private handleJsonResponse(response: any) {
    let handled = false;

    if (response.sessionResumptionUpdate) {
      handled = true;
      const update = response.sessionResumptionUpdate;
      console.warn(
        '[GeminiLiveClient] Full sessionResumptionUpdate:',
        JSON.stringify(update, null, 2),
      );
      if (update.resumable && update.newHandle) {
        this.sessionHandle = update.newHandle;
        this._log('Received session handle', this.sessionHandle, true);

        if (update.lastConsumedClientMessageIndex) {
          const lastConsumedIndex = parseInt(
            update.lastConsumedClientMessageIndex,
            10,
          );
          this._log(
            `Purging message history up to index ${lastConsumedIndex}`,
            null,
            true,
          );
          this.sentMessages = this.sentMessages.filter(
            msg => msg.index > lastConsumedIndex,
          );
        } else {
          this._log(
            `Clearing all message history up to index ${this.currentMessageIndex}`,
            null,
            true,
          );
          this.sentMessages = [];
        }
      }
    }

    if (response.goAway) {
      handled = true;
      console.warn(
        '[GeminiLiveClient] Received goAway message from server. Server may not close connection immediately.',
        response.goAway,
      );
      this._log('Received goAway', response.goAway, true);
      if (this.shouldResume()) {
        this._log(
          'Resumption requested, will reconnect after queue is empty',
          null,
          true,
        );
        this.pendingReconnection = true;
      }
    }

    if (response.setupComplete) {
      handled = true;
      this._log('Setup complete received', response.setupComplete, true);
      this.isSetupComplete = true;
      if (this.onSetupComplete) this.onSetupComplete();

      if (this.options.defaultGreeting) {
        this._log('Sending default greeting:', this.options.defaultGreeting);
        this.sendText(`Greet the user with: "${this.options.defaultGreeting}"`);
      }
    }

    if (response.serverContent) {
      handled = true;
      if (!this.receivedFirstResponse) {
        this.receivedFirstResponse = true;
        this._log(
          'Received first response, session eligible for resumption',
          null,
          true,
        );
      }

      if (response.serverContent.outputTranscription) {
        this.textPacketsReceived++;
        const text = response.serverContent.outputTranscription.text;
        this._log('Received output transcription:', text);
        if (this.onModelTranscript) this.onModelTranscript(text);
      }

      if (response.serverContent.inputTranscription) {
        this.textPacketsReceived++;
        const text = response.serverContent.inputTranscription.text;
        this._log('Received input transcription:', text);
        if (this.onUserTranscript) this.onUserTranscript(text);
      }

      if (response.serverContent.userTurn) {
        const parts = response.serverContent.userTurn.parts;
        for (const part of parts) {
          if (part.text) {
            this.textPacketsReceived++;
            this._log('Received user transcript in JSON', part.text);
            if (this.onUserTranscript) this.onUserTranscript(part.text);
          }
        }
      }

      if (response.serverContent.modelTurn) {
        const parts = response.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.text) {
            this.textPacketsReceived++;
            this._log('Received text data in JSON', part.text);
            if (this.onModelTranscript) this.onModelTranscript(part.text);
          }
          if (
            part.inlineData &&
            part.inlineData.mimeType.startsWith('audio/')
          ) {
            this.audioPacketsReceived++;
            this._log('Received audio data in JSON', {
              size: part.inlineData.data.length,
            });
            if (this.onAudioData) this.onAudioData(part.inlineData.data);
          }
          if (
            part.inlineData &&
            part.inlineData.mimeType.startsWith('video/')
          ) {
            this.videoPacketsReceived++;
            if (this.onVideoData)
              this.onVideoData(part.inlineData.data, part.inlineData.mimeType);
          }
        }
      }
    }

    if (response.toolCall) {
      handled = true;
      this._log('Received tool call:', response.toolCall, true);
      if (this.onToolCall) {
        this.onToolCall(response.toolCall);
      }
    }

    if (!handled) {
      console.warn(
        '[GeminiLiveClient] Received unhandled JSON response:',
        response,
      );
      this._log('Received unhandled JSON response', response, true);
    }
  }

  public get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public sendToolResponse(functionResponses: any[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const message = {
      toolResponse: {
        functionResponses: functionResponses
      }
    };
    this.currentMessageIndex++;
    this.sentMessages.push({index: this.currentMessageIndex, message});
    this.totalPacketsSent++;
    this.ws.send(JSON.stringify(message));
  }

  private shouldResume(): boolean {
    return (
      this.isSetupComplete &&
      this.receivedFirstResponse &&
      this.sessionHandle !== null
    );
  }

  private reconnect() {
    this._log('Attempting to reconnect for session resumption...', null, true);
    this.isSetupComplete = false;
    if (this.onReconnect) this.onReconnect();
    this.connect();
  }
}
