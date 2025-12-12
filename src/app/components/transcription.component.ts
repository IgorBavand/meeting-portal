import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranscriptionService, FullResult, TranscriptionResult, SummaryResult } from '../services/transcription.service';
import { Subscription, interval, switchMap, takeWhile, catchError, of } from 'rxjs';

@Component({
  selector: 'app-transcription',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="transcription-container">
      <header class="header">
        <h1>📝 Transcrição da Reunião</h1>
        <p class="room-name" *ngIf="roomName">Sala: {{ roomName }}</p>
      </header>

      <!-- Loading State -->
      <div class="loading-section" *ngIf="isLoading">
        <div class="spinner"></div>
        <h2>{{ loadingMessage }}</h2>
        <p class="status-text">{{ statusText }}</p>
        <div class="progress-bar">
          <div class="progress-fill" [style.width]="progressWidth"></div>
        </div>
      </div>

      <!-- Error State -->
      <div class="error-section" *ngIf="error">
        <div class="error-icon">❌</div>
        <h2>Erro ao processar</h2>
        <p>{{ error }}</p>
        <button class="btn-primary" (click)="goBack()">Voltar</button>
      </div>

      <!-- Results -->
      <div class="results-section" *ngIf="!isLoading && !error">
        
        <!-- Summary Card -->
        <div class="card summary-card" *ngIf="summary">
          <h2>📊 Resumo da Reunião</h2>
          
          <div class="summary-item" *ngIf="summary.generalSummary">
            <h3>Resumo Geral</h3>
            <p>{{ summary.generalSummary }}</p>
          </div>

          <div class="summary-item" *ngIf="summary.topicsDiscussed?.length">
            <h3>🎯 Tópicos Discutidos</h3>
            <ul>
              <li *ngFor="let topic of summary.topicsDiscussed">{{ topic }}</li>
            </ul>
          </div>

          <div class="summary-item" *ngIf="summary.decisionsMade?.length">
            <h3>✅ Decisões Tomadas</h3>
            <ul>
              <li *ngFor="let decision of summary.decisionsMade">{{ decision }}</li>
            </ul>
          </div>

          <div class="summary-item" *ngIf="summary.nextSteps?.length">
            <h3>➡️ Próximos Passos</h3>
            <ul>
              <li *ngFor="let step of summary.nextSteps">{{ step }}</li>
            </ul>
          </div>

          <div class="summary-item" *ngIf="summary.participantsMentioned?.length">
            <h3>👥 Participantes Mencionados</h3>
            <div class="tags">
              <span class="tag" *ngFor="let participant of summary.participantsMentioned">
                {{ participant }}
              </span>
            </div>
          </div>

          <div class="summary-item" *ngIf="summary.issuesRaised?.length">
            <h3>⚠️ Problemas/Dúvidas</h3>
            <ul>
              <li *ngFor="let issue of summary.issuesRaised">{{ issue }}</li>
            </ul>
          </div>

          <div class="sentiment" *ngIf="summary.overallSentiment">
            <span class="sentiment-label">Sentimento Geral:</span>
            <span class="sentiment-value" [class]="summary.overallSentiment.toLowerCase()">
              {{ getSentimentEmoji(summary.overallSentiment) }} {{ summary.overallSentiment }}
            </span>
          </div>
        </div>

        <!-- Transcription Card -->
        <div class="card transcription-card" *ngIf="transcription">
          <h2>📄 Transcrição Completa</h2>
          <div class="meta">
            <span>⏱️ Processado em: {{ transcription.duration }}ms</span>
            <span>📅 {{ formatDate(transcription.processedAt) }}</span>
          </div>
          <div class="transcription-text">
            {{ transcription.transcription }}
          </div>
        </div>

        <div class="actions">
          <button class="btn-secondary" (click)="copyTranscription()">
            📋 Copiar Transcrição
          </button>
          <button class="btn-primary" (click)="goBack()">
            🏠 Nova Reunião
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .transcription-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 2rem;
    }

    .header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .header h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .room-name {
      color: #888;
      font-size: 1rem;
    }

    /* Loading */
    .loading-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 50vh;
      text-align: center;
    }

    .spinner {
      width: 60px;
      height: 60px;
      border: 4px solid rgba(255,255,255,0.1);
      border-left-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1.5rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .status-text {
      color: #888;
      margin-top: 0.5rem;
    }

    .progress-bar {
      width: 300px;
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      margin-top: 1.5rem;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #8b5cf6);
      transition: width 0.5s ease;
    }

    /* Error */
    .error-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 50vh;
      text-align: center;
    }

    .error-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    /* Results */
    .results-section {
      max-width: 900px;
      margin: 0 auto;
    }

    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      border: 1px solid rgba(255,255,255,0.1);
    }

    .card h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .summary-item {
      margin-bottom: 1.25rem;
    }

    .summary-item h3 {
      font-size: 1rem;
      color: #3b82f6;
      margin-bottom: 0.5rem;
    }

    .summary-item ul {
      list-style: none;
      padding: 0;
    }

    .summary-item li {
      padding: 0.5rem 0;
      padding-left: 1.5rem;
      position: relative;
    }

    .summary-item li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #3b82f6;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .tag {
      background: rgba(59, 130, 246, 0.2);
      color: #3b82f6;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.875rem;
    }

    .sentiment {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255,255,255,0.1);
    }

    .sentiment-value {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-weight: 500;
    }

    .sentiment-value.positivo, .sentiment-value.positive {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }

    .sentiment-value.neutro, .sentiment-value.neutral {
      background: rgba(234, 179, 8, 0.2);
      color: #eab308;
    }

    .sentiment-value.negativo, .sentiment-value.negative {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    /* Transcription */
    .transcription-card .meta {
      display: flex;
      gap: 1.5rem;
      color: #888;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .transcription-text {
      background: rgba(0,0,0,0.2);
      padding: 1rem;
      border-radius: 8px;
      line-height: 1.6;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
    }

    /* Actions */
    .actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-top: 2rem;
    }

    .btn-primary, .btn-secondary {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .btn-secondary {
      background: rgba(255,255,255,0.1);
      color: white;
      border: 1px solid rgba(255,255,255,0.2);
    }

    .btn-secondary:hover {
      background: rgba(255,255,255,0.15);
    }
  `]
})
export class TranscriptionComponent implements OnInit, OnDestroy {
  roomSid: string = '';
  roomName: string = '';
  
  isLoading = true;
  loadingMessage = 'Processando transcrição...';
  statusText = 'Aguardando...';
  progressWidth = '10%';
  
  error: string | null = null;
  
  transcription: TranscriptionResult | null = null;
  summary: SummaryResult | null = null;
  
  private pollSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private transcriptionService: TranscriptionService
  ) {}

  ngOnInit() {
    this.roomSid = this.route.snapshot.paramMap.get('roomSid') || '';
    this.roomName = this.route.snapshot.queryParamMap.get('roomName') || '';
    const hasStreaming = this.route.snapshot.queryParamMap.get('hasStreaming') === 'true';
    
    if (!this.roomSid) {
      this.error = 'Room ID não fornecido';
      this.isLoading = false;
      return;
    }

    if (hasStreaming) {
      // Use streaming transcription (from live recording)
      this.loadStreamingTranscription();
    } else {
      // Fallback to room-based transcription (Twilio recordings)
      this.startPolling();
    }
  }

  ngOnDestroy() {
    this.pollSubscription?.unsubscribe();
  }

  private async loadStreamingTranscription() {
    this.loadingMessage = 'Finalizando transcrição...';
    this.statusText = 'Verificando status do processamento...';
    this.progressWidth = '20%';

    console.log('🔍 Loading streaming transcription for room:', this.roomSid);

    // Poll for processing completion before finalizing
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait

    while (attempts < maxAttempts) {
      try {
        const status = await this.transcriptionService.getStreamingTranscription(this.roomSid).toPromise();
        console.log('📊 Transcription status:', status);
        
        const processedChunks = status?.status?.processedChunks || 0;
        const activeProcessing = status?.status?.activeProcessing || 0;
        
        this.statusText = `Chunks processados: ${processedChunks}, Em processamento: ${activeProcessing}`;
        this.progressWidth = `${20 + Math.min(attempts, 50)}%`;
        
        // If no active processing and we have chunks, we're done waiting
        if (activeProcessing === 0 && (processedChunks > 0 || attempts > 30)) {
          console.log('✅ Processing complete, moving to finalization');
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (e) {
        console.warn('Error checking status:', e);
        if (attempts > 10) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
    }

    this.progressWidth = '70%';
    this.statusText = 'Gerando resumo com IA...';
    this.loadingMessage = 'Processando com Gemini...';

    try {
      console.log('🚀 Calling finalize-with-summary');
      const result = await this.transcriptionService.finalizeWithSummary(this.roomSid, this.roomName).toPromise();
      console.log('📝 Finalize result:', result);
      
      if (result?.fullTranscription) {
        this.transcription = {
          roomSid: this.roomSid,
          roomName: this.roomName,
          transcription: result.fullTranscription,
          duration: 0,
          processedAt: new Date().toISOString(),
          status: 'COMPLETED'
        };
      } else {
        console.warn('No transcription in result');
      }

      if (result?.summary) {
        this.summary = {
          roomSid: this.roomSid,
          roomName: this.roomName,
          summary: result.summary.summary || '',
          generalSummary: result.summary.generalSummary || null,
          topicsDiscussed: result.summary.topicsDiscussed || [],
          decisionsMade: result.summary.decisionsMade || [],
          nextSteps: result.summary.nextSteps || [],
          participantsMentioned: result.summary.participantsMentioned || [],
          issuesRaised: result.summary.issuesRaised || [],
          overallSentiment: result.summary.overallSentiment || null,
          processedAt: new Date().toISOString(),
          status: 'COMPLETED'
        };
      }

      this.isLoading = false;
      this.progressWidth = '100%';
      
      // Show error if no transcription
      if (!this.transcription?.transcription) {
        this.error = 'Nenhuma transcrição foi gerada. Verifique se o microfone estava habilitado durante a chamada.';
      }
    } catch (error: any) {
      console.error('Failed to load streaming transcription:', error);
      this.error = 'Erro ao processar transcrição: ' + (error?.message || 'Erro desconhecido');
      this.isLoading = false;
    }
  }

  private startPolling() {
    let pollCount = 0;
    
    this.pollSubscription = interval(2000).pipe(
      switchMap(() => this.transcriptionService.getFullResult(this.roomSid).pipe(
        catchError(err => {
          console.warn('Polling error, will retry:', err);
          return of(null);
        })
      )),
      takeWhile(() => this.isLoading, true)
    ).subscribe({
      next: (result) => {
        pollCount++;
        this.updateProgress(result, pollCount);
        
        if (result?.transcription) {
          this.transcription = result.transcription;
        }
        if (result?.summary) {
          this.summary = result.summary;
        }

        // Check if done
        const transcriptionDone = result?.transcription?.status === 'COMPLETED' || result?.transcription?.status === 'FAILED';
        const summaryDone = result?.summary?.status === 'COMPLETED' || result?.summary?.status === 'FAILED';
        
        if (transcriptionDone && summaryDone) {
          this.isLoading = false;
          this.progressWidth = '100%';
        }
      }
    });
  }

  private updateProgress(result: FullResult | null, pollCount: number) {
    const baseProgress = Math.min(pollCount * 3, 25);
    
    if (!result || !result.transcription) {
      this.loadingMessage = 'Aguardando processamento...';
      this.statusText = 'A sala está sendo processada pelo servidor';
      this.progressWidth = `${baseProgress}%`;
    } else if (result.transcription.status === 'PENDING') {
      this.loadingMessage = 'Baixando gravações...';
      this.statusText = 'Preparando arquivos de áudio';
      this.progressWidth = `${baseProgress + 10}%`;
    } else if (result.transcription.status === 'PROCESSING') {
      this.loadingMessage = 'Transcrevendo áudio...';
      this.statusText = 'Whisper está processando';
      this.progressWidth = `${40 + baseProgress}%`;
    } else if (result.transcription.status === 'COMPLETED' && result.summary?.status === 'PROCESSING') {
      this.loadingMessage = 'Gerando resumo...';
      this.statusText = 'Gemini está analisando';
      this.progressWidth = '75%';
    } else if (result.transcription.status === 'FAILED') {
      this.error = result.transcription.transcription || 'Falha na transcrição';
      this.isLoading = false;
    }
  }

  getSentimentEmoji(sentiment: string): string {
    const s = sentiment.toLowerCase();
    if (s.includes('positiv')) return '😊';
    if (s.includes('negativ')) return '😔';
    return '😐';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('pt-BR');
  }

  copyTranscription() {
    if (this.transcription?.transcription) {
      navigator.clipboard.writeText(this.transcription.transcription);
      alert('Transcrição copiada!');
    }
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
