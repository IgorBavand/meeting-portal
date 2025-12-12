import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, map, catchError, throwError, of } from 'rxjs';

export interface TranscriptionResult {
  roomSid: string;
  roomName: string | null;
  transcription: string;
  duration: number;
  processedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface SummaryResult {
  roomSid: string;
  roomName: string | null;
  summary: string;
  generalSummary: string | null;
  topicsDiscussed: string[];
  decisionsMade: string[];
  nextSteps: string[];
  participantsMentioned: string[];
  issuesRaised: string[];
  overallSentiment: string | null;
  processedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface FullResult {
  roomSid: string;
  transcription: TranscriptionResult | null;
  summary: SummaryResult | null;
  status?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TranscriptionService {
  private streamingApiUrl = 'https://meeting-api-production-e392.up.railway.app/api/v1/transcription';
  private roomsApiUrl = 'https://meeting-api-production-e392.up.railway.app/api/v1/rooms';

  constructor(private http: HttpClient) {}

  /**
   * Get streaming transcription (from live recording)
   */
  getStreamingTranscription(roomSid: string): Observable<any> {
    return this.http.get<any>(`${this.streamingApiUrl}/partial/${roomSid}`).pipe(
      catchError(error => {
        console.warn('Streaming transcription not found:', error);
        return of(null);
      })
    );
  }

  /**
   * Finalize streaming transcription with summary
   */
  finalizeWithSummary(roomSid: string, roomName?: string): Observable<any> {
    return this.http.post<any>(`${this.streamingApiUrl}/finalize-with-summary`, {
      roomSid,
      roomName
    }).pipe(
      catchError(error => {
        console.error('Failed to finalize with summary:', error);
        return throwError(() => error);
      })
    );
  }

  getTranscription(roomSid: string): Observable<TranscriptionResult> {
    return this.http.get<TranscriptionResult>(`${this.roomsApiUrl}/${roomSid}/transcription`).pipe(
      catchError(error => {
        console.error('Erro ao obter transcrição:', error);
        return throwError(() => new Error('Falha ao carregar transcrição'));
      })
    );
  }

  getSummary(roomSid: string): Observable<SummaryResult> {
    return this.http.get<SummaryResult>(`${this.roomsApiUrl}/${roomSid}/summary`).pipe(
      catchError(error => {
        console.error('Erro ao obter resumo:', error);
        return throwError(() => new Error('Falha ao carregar resumo'));
      })
    );
  }

  getFullResult(roomSid: string): Observable<FullResult> {
    return this.http.get<FullResult>(`${this.roomsApiUrl}/${roomSid}/full`).pipe(
      catchError(error => {
        console.error('Erro ao obter resultado completo:', error);
        return throwError(() => new Error('Falha ao carregar resultado'));
      })
    );
  }

  getStatus(roomSid: string): Observable<any> {
    return this.http.get<any>(`${this.roomsApiUrl}/${roomSid}/status`).pipe(
      catchError(error => {
        console.error('Erro ao obter status:', error);
        return throwError(() => new Error('Falha ao carregar status'));
      })
    );
  }

  pollTranscription(roomSid: string, intervalMs: number = 3000): Observable<TranscriptionResult> {
    return interval(intervalMs).pipe(
      switchMap(() => this.getTranscription(roomSid)),
      takeWhile(result => result.status === 'PENDING' || result.status === 'PROCESSING', true)
    );
  }

  pollFullResult(roomSid: string, intervalMs: number = 3000): Observable<FullResult> {
    return interval(intervalMs).pipe(
      switchMap(() => this.getFullResult(roomSid)),
      takeWhile(result => {
        const transcriptionDone = result.transcription?.status === 'COMPLETED' || result.transcription?.status === 'FAILED';
        const summaryDone = result.summary?.status === 'COMPLETED' || result.summary?.status === 'FAILED';
        return !(transcriptionDone && summaryDone);
      }, true)
    );
  }
}
