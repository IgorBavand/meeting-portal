import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AudioStreamingService {
  private audioContext: AudioContext | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private remoteSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private recordingInterval: any = null;
  private localStream: MediaStream | null = null;

  private transcriptionSubject = new BehaviorSubject<string[]>([]);
  transcription$ = this.transcriptionSubject.asObservable();

  private isRecordingSubject = new BehaviorSubject<boolean>(false);
  isRecording$ = this.isRecordingSubject.asObservable();

  private statusSubject = new BehaviorSubject<string>('idle');
  status$ = this.statusSubject.asObservable();

  private apiUrl = `${environment.apiUrl}/transcription`;

  // Configuration - 30 seconds for better context with AssemblyAI
  private readonly CHUNK_DURATION_MS = 30000;
  private readonly MAX_RETRIES = 2;

  private roomSid: string = '';
  private chunkIndex: number = 0;
  private pendingChunks: Set<number> = new Set();
  private failedChunks: Map<number, Blob> = new Map();

  constructor(private http: HttpClient) {}

  /**
   * Start recording all audio (local + remote participants)
   */
  async startRecording(roomSid: string, localStream?: MediaStream): Promise<void> {
    this.roomSid = roomSid;
    this.chunkIndex = 0;
    this.transcriptionSubject.next([]);
    this.pendingChunks.clear();
    this.failedChunks.clear();
    this.statusSubject.next('starting');

    try {
      // Create audio context for mixing - use native sample rate for quality
      this.audioContext = new AudioContext();
      this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();

      // Get local microphone if not provided
      if (localStream) {
        this.localStream = localStream;
      } else {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      // Connect local audio to destination
      this.localSource = this.audioContext.createMediaStreamSource(this.localStream);
      this.localSource.connect(this.mediaStreamDestination);

      this.isRecordingSubject.next(true);
      this.statusSubject.next('recording');

      // Start periodic recording with slight delay to ensure setup
      setTimeout(() => this.startPeriodicRecording(), 500);

      console.log('🎤 Audio streaming started for room:', roomSid);
    } catch (error) {
      console.error('Failed to start audio recording:', error);
      this.statusSubject.next('error');
      throw error;
    }
  }

  /**
   * Add a remote participant's audio track to the mix
   */
  addRemoteAudioTrack(participantId: string, audioTrack: MediaStreamTrack): void {
    if (!this.audioContext || !this.mediaStreamDestination) {
      console.warn('Audio context not initialized, cannot add remote track');
      return;
    }

    try {
      // Remove existing source for this participant if any
      this.removeRemoteAudioTrack(participantId);

      // Create a stream from the track
      const stream = new MediaStream([audioTrack]);
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.mediaStreamDestination);

      this.remoteSources.set(participantId, source);
      console.log(`🔊 Added remote audio for participant: ${participantId}`);
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
      } catch (e) {
        // Ignore disconnect errors
      }
      this.remoteSources.delete(participantId);
      console.log(`🔇 Removed remote audio for participant: ${participantId}`);
    }
  }

  private startPeriodicRecording(): void {
    if (!this.isRecordingSubject.value) return;
    
    // Record first chunk immediately
    this.recordChunk();

    // Then record periodically
    this.recordingInterval = setInterval(() => {
      if (this.isRecordingSubject.value) {
        this.recordChunk();
      }
    }, this.CHUNK_DURATION_MS);
  }

  private recordChunk(): void {
    if (!this.mediaStreamDestination || !this.isRecordingSubject.value) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    try {
      const recorder = new MediaRecorder(this.mediaStreamDestination.stream, { 
        mimeType,
        audioBitsPerSecond: 128000 // 128kbps for good quality
      });
      const chunks: Blob[] = [];
      const currentIndex = this.chunkIndex++;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (chunks.length > 0 && this.isRecordingSubject.value) {
          const audioBlob = new Blob(chunks, { type: mimeType });
          // Only send if blob has meaningful size (> 1KB)
          if (audioBlob.size > 1000) {
            this.sendChunkToServer(audioBlob, currentIndex);
          }
        }
      };

      recorder.start();
      this.mediaRecorder = recorder;

      // Stop after chunk duration (with buffer)
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, this.CHUNK_DURATION_MS - 500);
    } catch (error) {
      console.error('Error starting chunk recording:', error);
    }
  }

  private async sendChunkToServer(audioBlob: Blob, chunkIndex: number, retryCount: number = 0): Promise<void> {
    const formData = new FormData();
    formData.append('audio', audioBlob, `chunk_${chunkIndex}.webm`);
    formData.append('roomSid', this.roomSid);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('hasOverlap', 'false');

    this.pendingChunks.add(chunkIndex);
    this.statusSubject.next(`processing_${this.pendingChunks.size}`);

    try {
      const participantCount = this.remoteSources.size + 1;
      console.log(`📤 Sending chunk ${chunkIndex} (${(audioBlob.size / 1024).toFixed(1)}KB, ${participantCount} participants)`);

      const response = await fetch(`${this.apiUrl}/chunk`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        this.pendingChunks.delete(chunkIndex);
        this.failedChunks.delete(chunkIndex);
        
        // AssemblyAI processes async, just log success
        console.log(`✅ Chunk ${chunkIndex} queued successfully`);
        this.statusSubject.next(this.pendingChunks.size > 0 ? `processing_${this.pendingChunks.size}` : 'recording');
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to send chunk ${chunkIndex}:`, error);
      this.pendingChunks.delete(chunkIndex);
      
      // Retry logic
      if (retryCount < this.MAX_RETRIES) {
        console.log(`🔄 Retrying chunk ${chunkIndex} (attempt ${retryCount + 1})`);
        setTimeout(() => {
          this.sendChunkToServer(audioBlob, chunkIndex, retryCount + 1);
        }, 2000 * (retryCount + 1));
      } else {
        // Store for final retry
        this.failedChunks.set(chunkIndex, audioBlob);
        console.warn(`❌ Chunk ${chunkIndex} failed after ${this.MAX_RETRIES} retries`);
      }
    }
  }

  async stopRecording(): Promise<string> {
    this.statusSubject.next('finalizing');
    this.isRecordingSubject.next(false);

    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    // Stop current recorder and send remaining audio
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    // Disconnect all sources
    if (this.localSource) {
      try { this.localSource.disconnect(); } catch (e) {}
    }
    this.remoteSources.forEach((source) => {
      try { source.disconnect(); } catch (e) {}
    });
    this.remoteSources.clear();

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }

    this.audioContext = null;
    this.mediaStreamDestination = null;
    this.localSource = null;

    // Wait a moment for any in-flight chunks to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Retry failed chunks one more time
    for (const [index, blob] of this.failedChunks) {
      console.log(`🔄 Final retry for chunk ${index}`);
      await this.sendChunkToServer(blob, index, this.MAX_RETRIES - 1);
    }

    // Wait for pending chunks (max 10 seconds)
    const waitStart = Date.now();
    while (this.pendingChunks.size > 0 && Date.now() - waitStart < 10000) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('🏁 Recording stopped, finalizing transcription...');
    this.statusSubject.next('idle');
    
    // Return empty - the transcription page will fetch from server
    return '';
  }

  getFullTranscription(): string {
    return this.transcriptionSubject.value.join(' ');
  }

  getCurrentTranscriptions(): string[] {
    return this.transcriptionSubject.value;
  }

  getParticipantCount(): number {
    return this.remoteSources.size + 1; // +1 for local
  }

  getPendingChunksCount(): number {
    return this.pendingChunks.size;
  }

  getRoomSid(): string {
    return this.roomSid;
  }
}
