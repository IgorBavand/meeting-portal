import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TranscriptMessage {
  type: 'transcript' | 'started' | 'completed' | 'error';
  text?: string;
  isFinal?: boolean;
  fullTranscription?: string;
  summary?: any;
  error?: string;
  roomSid?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketTranscriptionService implements OnDestroy {
  private websocket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private remoteSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private scriptProcessor: ScriptProcessorNode | null = null;
  private localStream: MediaStream | null = null;

  // Observables
  private transcriptSubject = new BehaviorSubject<string>('');
  private partialTranscriptSubject = new BehaviorSubject<string>('');
  private statusSubject = new BehaviorSubject<string>('idle');
  private isRecordingSubject = new BehaviorSubject<boolean>(false);
  private completedSubject = new Subject<TranscriptMessage>();

  transcript$ = this.transcriptSubject.asObservable();
  partialTranscript$ = this.partialTranscriptSubject.asObservable();
  status$ = this.statusSubject.asObservable();
  isRecording$ = this.isRecordingSubject.asObservable();
  completed$ = this.completedSubject.asObservable();

  private roomSid: string = '';
  private fullTranscript: string[] = [];

  private readonly SAMPLE_RATE = 16000; // AssemblyAI requires 16kHz

  ngOnDestroy(): void {
    this.stopRecording();
  }

  /**
   * Start real-time transcription via WebSocket
   */
  async startRecording(roomSid: string, localStream?: MediaStream): Promise<void> {
    this.roomSid = roomSid;
    this.fullTranscript = [];
    this.transcriptSubject.next('');
    this.partialTranscriptSubject.next('');
    this.statusSubject.next('connecting');

    try {
      // Connect WebSocket
      await this.connectWebSocket();

      // Setup audio capture
      await this.setupAudioCapture(localStream);

      // Send start message
      this.sendMessage({
        type: 'start',
        roomSid: roomSid
      });

      this.isRecordingSubject.next(true);
      this.statusSubject.next('recording');

      console.log('🎤 Real-time transcription started for room:', roomSid);
    } catch (error) {
      console.error('Failed to start real-time transcription:', error);
      this.statusSubject.next('error');
      throw error;
    }
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build WebSocket URL
      const apiUrl = environment.apiUrl;
      let wsUrl: string;

      if (apiUrl.startsWith('https://')) {
        wsUrl = apiUrl.replace('https://', 'wss://').replace('/api/v1', '') + '/ws/transcription';
      } else if (apiUrl.startsWith('http://')) {
        wsUrl = apiUrl.replace('http://', 'ws://').replace('/api/v1', '') + '/ws/transcription';
      } else {
        // Relative URL - use current host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/transcription`;
      }

      console.log('🔌 Connecting to WebSocket:', wsUrl);

      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('✅ WebSocket connected');
        resolve();
      };

      this.websocket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      };

      this.websocket.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        this.isRecordingSubject.next(false);
        this.statusSubject.next('idle');
      };

      this.websocket.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.websocket?.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private handleMessage(message: TranscriptMessage): void {
    switch (message.type) {
      case 'started':
        console.log('🎙️ Transcription session started');
        this.statusSubject.next('recording');
        break;

      case 'transcript':
        if (message.isFinal && message.text) {
          // Final transcript - add to full transcript
          this.fullTranscript.push(message.text);
          this.transcriptSubject.next(this.fullTranscript.join(' '));
          this.partialTranscriptSubject.next('');
          console.log('📝 Final:', message.text);
        } else if (message.text) {
          // Partial transcript - show as preview
          this.partialTranscriptSubject.next(message.text);
        }
        break;

      case 'completed':
        console.log('✅ Transcription completed');
        this.statusSubject.next('completed');
        this.completedSubject.next(message);
        break;

      case 'error':
        console.error('❌ Transcription error:', message.error);
        this.statusSubject.next('error');
        break;
    }
  }

  private async setupAudioCapture(localStream?: MediaStream): Promise<void> {
    // Create audio context with target sample rate
    this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });
    this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();

    // Get local microphone if not provided
    if (localStream) {
      this.localStream = localStream;
    } else {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.SAMPLE_RATE
        }
      });
    }

    // Connect local audio
    this.localSource = this.audioContext.createMediaStreamSource(this.localStream);
    this.localSource.connect(this.mediaStreamDestination);

    // Create script processor to capture audio data
    // Using 4096 buffer size for balance between latency and efficiency
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRecordingSubject.value || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      const inputData = event.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16 PCM
      const pcmData = this.float32ToInt16(inputData);

      // Convert to base64 and send
      const base64Audio = this.arrayBufferToBase64(pcmData.buffer);
      this.sendMessage({
        type: 'audio',
        audio: base64Audio
      });
    };

    // Connect the audio graph
    this.mediaStreamDestination.stream.getAudioTracks().forEach(track => {
      const source = this.audioContext!.createMediaStreamSource(new MediaStream([track]));
      source.connect(this.scriptProcessor!);
    });

    this.scriptProcessor.connect(this.audioContext.destination);
  }

  /**
   * Add a remote participant's audio track
   */
  addRemoteAudioTrack(participantId: string, audioTrack: MediaStreamTrack): void {
    if (!this.audioContext || !this.mediaStreamDestination) {
      console.warn('Audio context not initialized');
      return;
    }

    try {
      this.removeRemoteAudioTrack(participantId);

      const stream = new MediaStream([audioTrack]);
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.mediaStreamDestination);

      this.remoteSources.set(participantId, source);
      console.log(`🔊 Added remote audio: ${participantId}`);
    } catch (error) {
      console.error(`Failed to add remote audio for ${participantId}:`, error);
    }
  }

  /**
   * Remove a remote participant's audio
   */
  removeRemoteAudioTrack(participantId: string): void {
    const source = this.remoteSources.get(participantId);
    if (source) {
      try {
        source.disconnect();
      } catch (e) { }
      this.remoteSources.delete(participantId);
      console.log(`🔇 Removed remote audio: ${participantId}`);
    }
  }

  /**
   * Stop recording and get final transcription
   */
  async stopRecording(): Promise<TranscriptMessage | null> {
    return new Promise((resolve) => {
      this.statusSubject.next('finalizing');
      this.isRecordingSubject.next(false);

      // Stop audio processing
      if (this.scriptProcessor) {
        this.scriptProcessor.disconnect();
        this.scriptProcessor = null;
      }

      if (this.localSource) {
        try { this.localSource.disconnect(); } catch (e) { }
      }

      this.remoteSources.forEach((source) => {
        try { source.disconnect(); } catch (e) { }
      });
      this.remoteSources.clear();

      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }

      this.audioContext = null;
      this.mediaStreamDestination = null;
      this.localSource = null;

      // Wait for completed message or timeout
      const timeout = setTimeout(() => {
        console.warn('⏰ Timeout waiting for completion');
        this.closeWebSocket();
        resolve(null);
      }, 30000);

      // Subscribe to completed event
      const subscription = this.completed$.subscribe((result) => {
        clearTimeout(timeout);
        subscription.unsubscribe();
        this.closeWebSocket();
        resolve(result);
      });

      // Send stop message
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'stop' });
      } else {
        clearTimeout(timeout);
        subscription.unsubscribe();
        resolve(null);
      }
    });
  }

  private closeWebSocket(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.statusSubject.next('idle');
  }

  private sendMessage(data: any): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(data));
    }
  }

  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  getFullTranscription(): string {
    return this.fullTranscript.join(' ');
  }

  getParticipantCount(): number {
    return this.remoteSources.size + 1;
  }

  getRoomSid(): string {
    return this.roomSid;
  }
}
