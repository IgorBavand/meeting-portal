import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TranscriptMessage {
  type: 'connected' | 'started' | 'transcript' | 'completed' | 'error' | 'session_info' | 'pong';
  text?: string;
  isFinal?: boolean;
  confidence?: number;
  words?: WordInfo[];
  fullTranscription?: string;
  summary?: any;
  error?: string;
  roomSid?: string;
  stats?: SessionStats;
  assemblySessionId?: string;
}

export interface WordInfo {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SessionStats {
  totalChunks: number;
  totalBytes: number;
  finalTranscripts: number;
  durationMs: number;
  avgBytesPerSecond: number;
}

/**
 * Optimized WebSocket Transcription Service for AssemblyAI Real-time Streaming
 * 
 * Features:
 * - Direct WebSocket connection to backend which bridges to AssemblyAI
 * - Audio buffering for optimal 250ms chunks
 * - Automatic reconnection on connection loss
 * - Mixed audio from all participants (local + remote)
 * - Word-level timestamps and confidence scores
 * 
 * Audio Format:
 * - Sample Rate: 16000 Hz
 * - Bit Depth: 16-bit signed PCM
 * - Channels: Mono
 * - Encoding: Base64 for WebSocket transmission
 */
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

  // Audio buffering for optimal chunk sizes
  private audioBuffer: Int16Array[] = [];
  private readonly BUFFER_SIZE = 4096; // Samples per callback
  private readonly TARGET_CHUNK_SAMPLES = 4000; // 250ms at 16kHz
  private bufferedSamples = 0;

  // Observables
  private transcriptSubject = new BehaviorSubject<string>('');
  private partialTranscriptSubject = new BehaviorSubject<string>('');
  private statusSubject = new BehaviorSubject<string>('idle');
  private isRecordingSubject = new BehaviorSubject<boolean>(false);
  private completedSubject = new Subject<TranscriptMessage>();
  private confidenceSubject = new BehaviorSubject<number>(0);

  transcript$ = this.transcriptSubject.asObservable();
  partialTranscript$ = this.partialTranscriptSubject.asObservable();
  status$ = this.statusSubject.asObservable();
  isRecording$ = this.isRecordingSubject.asObservable();
  completed$ = this.completedSubject.asObservable();
  confidence$ = this.confidenceSubject.asObservable();

  private roomSid: string = '';
  private roomName: string = '';
  private fullTranscript: string[] = [];

  private readonly SAMPLE_RATE = 16000; // AssemblyAI requires 16kHz
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private pingInterval: any = null;

  ngOnDestroy(): void {
    this.stopRecording();
  }

  /**
   * Start real-time transcription via WebSocket with AssemblyAI streaming
   */
  async startRecording(roomSid: string, roomName?: string, localStream?: MediaStream): Promise<void> {
    this.roomSid = roomSid;
    this.roomName = roomName || '';
    this.fullTranscript = [];
    this.audioBuffer = [];
    this.bufferedSamples = 0;
    this.reconnectAttempts = 0;
    this.transcriptSubject.next('');
    this.partialTranscriptSubject.next('');
    this.confidenceSubject.next(0);
    this.statusSubject.next('connecting');

    try {
      // Connect WebSocket first
      await this.connectWebSocket();

      // Setup audio capture with mixing
      await this.setupAudioCapture(localStream);

      // Send start message with room info
      this.sendMessage({
        type: 'start',
        roomSid: roomSid,
        roomName: roomName || null
      });

      this.isRecordingSubject.next(true);
      this.statusSubject.next('recording');

      // Start ping interval to keep connection alive
      this.startPingInterval();

      console.log('🎤 Real-time streaming transcription started for room:', roomSid);
    } catch (error) {
      console.error('Failed to start real-time transcription:', error);
      this.statusSubject.next('error');
      throw error;
    }
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const apiUrl = environment.apiUrl;
      let wsUrl: string;

      if (apiUrl.startsWith('https://')) {
        wsUrl = apiUrl.replace('https://', 'wss://').replace('/api/v1', '') + '/ws/transcription';
      } else if (apiUrl.startsWith('http://')) {
        wsUrl = apiUrl.replace('http://', 'ws://').replace('/api/v1', '') + '/ws/transcription';
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/transcription`;
      }

      console.log('🔌 Connecting to WebSocket:', wsUrl);

      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.websocket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      };

      this.websocket.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        this.stopPingInterval();
        
        // Try to reconnect if recording was active
        if (this.isRecordingSubject.value && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.attemptReconnect();
        } else {
          this.isRecordingSubject.next(false);
          this.statusSubject.next('idle');
        }
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

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    console.log(`🔄 Attempting reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
    this.statusSubject.next('reconnecting');

    await new Promise(resolve => setTimeout(resolve, 1000 * this.reconnectAttempts));

    try {
      await this.connectWebSocket();
      this.sendMessage({
        type: 'start',
        roomSid: this.roomSid,
        roomName: this.roomName || null
      });
      this.statusSubject.next('recording');
    } catch (e) {
      console.error('Reconnect failed:', e);
      if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
        this.statusSubject.next('error');
      }
    }
  }

  private handleMessage(message: TranscriptMessage): void {
    switch (message.type) {
      case 'connected':
        console.log('🔗 Server ready for transcription');
        break;

      case 'started':
        console.log('🎙️ Transcription session started');
        this.statusSubject.next('recording');
        break;

      case 'session_info':
        console.log('📋 AssemblyAI session:', message.assemblySessionId);
        break;

      case 'transcript':
        if (message.isFinal && message.text) {
          // Final transcript - add to full transcript
          this.fullTranscript.push(message.text);
          this.transcriptSubject.next(this.fullTranscript.join(' '));
          this.partialTranscriptSubject.next('');
          if (message.confidence) {
            this.confidenceSubject.next(message.confidence);
          }
          console.log('📝 Final:', message.text.substring(0, 50) + '...');
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

      case 'pong':
        // Keep-alive response
        break;
    }
  }

  private async setupAudioCapture(localStream?: MediaStream): Promise<void> {
    // Create audio context at target sample rate for quality
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

    // Connect local audio to destination for mixing
    this.localSource = this.audioContext.createMediaStreamSource(this.localStream);
    this.localSource.connect(this.mediaStreamDestination);

    // Create script processor to capture mixed audio
    // Using 4096 buffer for balance between latency and efficiency
    this.scriptProcessor = this.audioContext.createScriptProcessor(this.BUFFER_SIZE, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRecordingSubject.value || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      const inputData = event.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16 PCM
      const pcmData = this.float32ToInt16(inputData);
      
      // Buffer audio for optimal chunk sizes
      this.audioBuffer.push(pcmData);
      this.bufferedSamples += pcmData.length;

      // Send when we have enough samples (250ms = 4000 samples at 16kHz)
      if (this.bufferedSamples >= this.TARGET_CHUNK_SAMPLES) {
        this.flushAudioBuffer();
      }
    };

    // Connect the mixed audio to processor
    this.mediaStreamDestination.stream.getAudioTracks().forEach(track => {
      const source = this.audioContext!.createMediaStreamSource(new MediaStream([track]));
      source.connect(this.scriptProcessor!);
    });

    this.scriptProcessor.connect(this.audioContext.destination);
  }

  private flushAudioBuffer(): void {
    if (this.audioBuffer.length === 0) return;

    // Combine all buffered chunks
    const totalLength = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioBuffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to base64 and send
    const base64Audio = this.arrayBufferToBase64(combined.buffer);
    this.sendMessage({
      type: 'audio',
      audio: base64Audio
    });

    // Clear buffer
    this.audioBuffer = [];
    this.bufferedSamples = 0;
  }

  /**
   * Add a remote participant's audio track to the mix
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
   * Remove a remote participant's audio from the mix
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
   * Stop recording and get final transcription with summary
   */
  async stopRecording(): Promise<TranscriptMessage | null> {
    return new Promise((resolve) => {
      this.statusSubject.next('finalizing');
      this.isRecordingSubject.next(false);
      this.stopPingInterval();

      // Flush any remaining audio
      this.flushAudioBuffer();

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

      // Send stop message to trigger summary generation
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'stop' });
      } else {
        clearTimeout(timeout);
        subscription.unsubscribe();
        resolve(null);
      }
    });
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'ping' });
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
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
