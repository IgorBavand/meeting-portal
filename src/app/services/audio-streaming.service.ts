import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';

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

  private apiUrl = 'https://meeting-api-production-e392.up.railway.app/api/v1/transcription';

  // Configuration
  private readonly CHUNK_DURATION_MS = 10000; // 10 seconds

  private roomSid: string = '';
  private chunkIndex: number = 0;

  constructor(private http: HttpClient) {}

  /**
   * Start recording all audio (local + remote participants)
   */
  async startRecording(roomSid: string, localStream?: MediaStream): Promise<void> {
    this.roomSid = roomSid;
    this.chunkIndex = 0;
    this.transcriptionSubject.next([]);

    try {
      // Create audio context for mixing
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();

      // Get local microphone if not provided
      if (localStream) {
        this.localStream = localStream;
      } else {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16000
          }
        });
      }

      // Connect local audio to destination
      this.localSource = this.audioContext.createMediaStreamSource(this.localStream);
      this.localSource.connect(this.mediaStreamDestination);

      this.isRecordingSubject.next(true);

      // Start periodic recording
      this.startPeriodicRecording();

      console.log('🎤 Audio streaming started for room:', roomSid);
    } catch (error) {
      console.error('Failed to start audio recording:', error);
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
    // Record first chunk immediately
    this.recordChunk();

    // Then record periodically
    this.recordingInterval = setInterval(() => {
      this.recordChunk();
    }, this.CHUNK_DURATION_MS);
  }

  private recordChunk(): void {
    if (!this.mediaStreamDestination || !this.isRecordingSubject.value) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(this.mediaStreamDestination.stream, { mimeType });
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
        await this.sendChunkToServer(audioBlob, currentIndex);
      }
    };

    recorder.start();
    this.mediaRecorder = recorder;

    // Stop after chunk duration
    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, this.CHUNK_DURATION_MS - 200);
  }

  private async sendChunkToServer(audioBlob: Blob, chunkIndex: number): Promise<void> {
    const formData = new FormData();
    formData.append('audio', audioBlob, `chunk_${chunkIndex}.webm`);
    formData.append('roomSid', this.roomSid);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('hasOverlap', 'false');

    try {
      const participantCount = this.remoteSources.size + 1;
      console.log(`📤 Sending chunk ${chunkIndex} (${audioBlob.size} bytes, ${participantCount} participants)`);

      const response = await fetch(`${this.apiUrl}/chunk`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.transcription && data.transcription.trim()) {
          const currentTranscriptions = [...this.transcriptionSubject.value];
          currentTranscriptions.push(data.transcription);
          this.transcriptionSubject.next(currentTranscriptions);
          console.log(`📝 Chunk ${data.chunkIndex} transcribed:`, data.transcription.substring(0, 50) + '...');
        }
      } else {
        console.error('Chunk upload failed:', response.status);
      }
    } catch (error) {
      console.error('Failed to send chunk:', error);
    }
  }

  async stopRecording(): Promise<string> {
    this.isRecordingSubject.next(false);

    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

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

    // Finalize transcription on server
    try {
      const response = await fetch(`${this.apiUrl}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomSid: this.roomSid })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🏁 Recording stopped, final transcription ready');
        return data?.fullTranscription || this.getFullTranscription();
      }
    } catch (error) {
      console.error('Failed to finalize transcription:', error);
    }

    return this.getFullTranscription();
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
}
