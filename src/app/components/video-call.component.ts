import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TwilioService } from '../services/twilio.service';
import { TokenService } from '../services/token.service';
import { ChatService } from '../services/chat.service';
import { WebSocketTranscriptionService } from '../services/websocket-transcription.service';
import { Room, RemoteParticipant, RemoteTrack, RemoteVideoTrack, RemoteAudioTrack } from 'twilio-video';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-video-call',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-call.component.html',
  styleUrl: './video-call.component.scss'
})
export class VideoCallComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('chatMessages') chatMessages!: ElementRef<HTMLDivElement>;
  
  identity = '';
  roomName = '';
  roomSid = '';
  isConnected = false;
  participants: RemoteParticipant[] = [];
  isMuted = false;
  isVideoOff = false;
  showChat = false;
  newMessage = '';
  messages: {user: string, text: string, time: string}[] = [];
  
  // Live transcription
  liveTranscription: string[] = [];
  isTranscribing = false;
  transcriptionStatus = '';
  
  predefinedRooms = ['Sala Geral', 'Reunião', 'Trabalho', 'Família', 'Amigos'];
  
  constructor(
    private twilioService: TwilioService,
    private tokenService: TokenService,
    private chatService: ChatService,
    private transcriptionService: WebSocketTranscriptionService,
    private router: Router
  ) {}

  ngOnInit() {
    this.twilioService.participants$.subscribe(participants => {
      this.participants = participants;
      this.attachParticipantTracks();
    });

    // Handle participant disconnection - remove their audio from mix
    this.twilioService.participantDisconnected$.subscribe(participantSid => {
      this.transcriptionService.removeRemoteAudioTrack(participantSid);
    });

    this.chatService.messages$.subscribe(messages => {
      console.log('📨 Messages received in component:', messages);
      this.messages = messages;
      setTimeout(() => {
        if (this.chatMessages?.nativeElement) {
          this.chatMessages.nativeElement.scrollTop = this.chatMessages.nativeElement.scrollHeight;
        }
      }, 100);
    });

    // Subscribe to real-time transcription updates
    this.transcriptionService.transcript$.subscribe(transcript => {
      if (transcript) {
        this.liveTranscription = transcript.split('. ').filter(s => s.trim());
      }
    });

    this.transcriptionService.partialTranscript$.subscribe(partial => {
      // Show partial transcript as last item
      if (partial && this.liveTranscription.length > 0) {
        // Replace last item if it's a partial
        const lastItem = this.liveTranscription[this.liveTranscription.length - 1];
        if (!lastItem.endsWith('.')) {
          this.liveTranscription[this.liveTranscription.length - 1] = partial;
        } else {
          this.liveTranscription.push(partial);
        }
      }
    });

    this.transcriptionService.isRecording$.subscribe(isRecording => {
      this.isTranscribing = isRecording;
    });

    // Subscribe to status updates
    this.transcriptionService.status$.subscribe(status => {
      switch (status) {
        case 'connecting':
          this.transcriptionStatus = 'Conectando...';
          break;
        case 'recording':
          this.transcriptionStatus = 'Transcrevendo em tempo real...';
          break;
        case 'finalizing':
          this.transcriptionStatus = 'Finalizando...';
          break;
        case 'completed':
          this.transcriptionStatus = 'Concluído';
          break;
        case 'error':
          this.transcriptionStatus = 'Erro na transcrição';
          break;
        default:
          this.transcriptionStatus = '';
      }
    });
  }

  ngOnDestroy() {
    // Disconnect without confirmation dialog when component is destroyed
    if (this.isConnected) {
      this.transcriptionService.stopRecording();
      this.twilioService.leaveRoom();
      this.chatService.leaveRoom(this.roomName, this.identity);
    }
  }

  async joinCall() {
    if (!this.identity || !this.roomName) {
      alert('Preencha nome e sala');
      return;
    }

    // Verificar se getUserMedia está disponível
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Câmera/microfone não suportado. Conectando sem vídeo.');
      // Continua sem vídeo
    }
    
    try {
      console.log('Obtendo token para:', this.identity, 'na sala:', this.roomName);
      
      // Use the new endpoint that creates room with recording
      const token = await this.tokenService.getAccessTokenForRoom(this.identity, this.roomName).toPromise();
      console.log('Token recebido:', token);
      console.log('Token length:', token?.length);
      
      if (!token || token.trim() === '') {
        alert('Token vazio ou inválido');
        return;
      }
      
      console.log('Conectando na sala:', this.roomName);
      const room = await this.twilioService.joinRoom(token.trim(), this.roomName);
      this.isConnected = true;
      this.roomSid = room.sid;
      console.log('Conectado com sucesso. Room SID:', this.roomSid);
      
      // Initialize and join chat room
      this.chatService.initializeChat(token.trim());
      this.chatService.joinRoom(this.roomName, this.identity);
      
      // Start real-time transcription via WebSocket with room name for better summary
      try {
        await this.transcriptionService.startRecording(this.roomSid, this.roomName);
        console.log('🎤 Real-time streaming transcription started via WebSocket');
      } catch (streamError) {
        console.warn('Could not start real-time transcription:', streamError);
      }
      
      // Anexar tracks locais
      setTimeout(() => {
        if (this.localVideo?.nativeElement) {
          room.localParticipant.videoTracks.forEach(track => {
            if (track.track) {
              track.track.attach(this.localVideo.nativeElement);
            }
          });
        }
      }, 100);
      
    } catch (error: any) {
      console.error('Erro ao entrar na chamada:', error);
      const errorMessage = error?.message || 'Erro desconhecido ao conectar';
      Swal.fire({
        title: 'Erro de Conexão',
        text: errorMessage,
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  }

  async leaveCall() {
    const result = await Swal.fire({
      title: 'Sair da chamada?',
      text: 'Tem certeza que deseja encerrar a reunião?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sim, sair',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      const savedRoomSid = this.roomSid;
      const savedRoomName = this.roomName;
      
      // Stop real-time transcription and get result
      let transcriptionResult = null;
      try {
        transcriptionResult = await this.transcriptionService.stopRecording();
        console.log('📝 Real-time transcription stopped, result:', transcriptionResult);
      } catch (e) {
        console.warn('Error stopping transcription:', e);
      }
      
      this.twilioService.leaveRoom();
      this.chatService.leaveRoom(this.roomName, this.identity);
      this.isConnected = false;
      this.participants = [];
      this.messages = [];
      this.liveTranscription = [];
      
      // Navigate to transcription page with WebSocket result
      if (savedRoomSid) {
        this.router.navigate(['/transcription', savedRoomSid], {
          queryParams: { 
            roomName: savedRoomName,
            hasWebSocket: 'true'
          },
          state: {
            transcriptionResult: transcriptionResult
          }
        });
      }
    }
  }
  
  selectRoom(room: string) {
    this.roomName = room;
  }

  toggleChat() {
    this.showChat = !this.showChat;
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;
    
    const message = {
      user: this.identity,
      text: this.newMessage.trim(),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    
    console.log('📤 Sending message from component:', message);
    console.log('📤 Current messages array:', this.messages);
    
    // Send to chat service (will sync with other participants)
    this.chatService.sendMessage(this.roomName, message);
    
    this.newMessage = '';
  }

  toggleMute() {
    const room = this.twilioService.getCurrentRoom();
    if (!room) return;

    room.localParticipant.audioTracks.forEach(track => {
      if (this.isMuted) {
        track.track?.enable();
      } else {
        track.track?.disable();
      }
    });
    this.isMuted = !this.isMuted;
  }

  toggleVideo() {
    const room = this.twilioService.getCurrentRoom();
    if (!room) return;

    room.localParticipant.videoTracks.forEach(track => {
      if (this.isVideoOff) {
        track.track?.enable();
      } else {
        track.track?.disable();
      }
    });
    this.isVideoOff = !this.isVideoOff;
  }

  trackParticipant(index: number, participant: RemoteParticipant): string {
    return participant.sid;
  }

  private attachParticipantTracks() {
    setTimeout(() => {
      this.participants.forEach(participant => {
        const container = document.getElementById(`remote-${participant.sid}`);
        if (!container) return;
        
        container.innerHTML = '';
        
        participant.videoTracks.forEach(track => {
          if (track.isSubscribed && track.track) {
            container.appendChild(track.track.attach());
          }
        });
        
        participant.audioTracks.forEach(track => {
          if (track.isSubscribed && track.track) {
            track.track.attach();
            // Add remote audio to transcription mix
            const mediaStreamTrack = track.track.mediaStreamTrack;
            if (mediaStreamTrack) {
              this.transcriptionService.addRemoteAudioTrack(participant.sid, mediaStreamTrack);
            }
          }
        });
        
        // Listen for new tracks
        participant.on('trackSubscribed', track => {
          if (track.kind === 'video') {
            container.appendChild(track.attach());
          } else if (track.kind === 'audio') {
            track.attach();
            // Add remote audio to transcription mix
            const mediaStreamTrack = track.mediaStreamTrack;
            if (mediaStreamTrack) {
              this.transcriptionService.addRemoteAudioTrack(participant.sid, mediaStreamTrack);
            }
          }
        });

        // Listen for unsubscribed tracks
        participant.on('trackUnsubscribed', track => {
          if (track.kind === 'audio') {
            this.transcriptionService.removeRemoteAudioTrack(participant.sid);
          }
        });
      });
    }, 100);
  }
}