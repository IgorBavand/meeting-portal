import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TwilioService } from '../services/twilio.service';
import { TokenService } from '../services/token.service';
import { ChatService } from '../services/chat.service';
import { AudioStreamingService } from '../services/audio-streaming.service';
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
  
  predefinedRooms = ['Sala Geral', 'Reunião', 'Trabalho', 'Família', 'Amigos'];
  
  constructor(
    private twilioService: TwilioService,
    private tokenService: TokenService,
    private chatService: ChatService,
    private audioStreamingService: AudioStreamingService,
    private router: Router
  ) {}

  ngOnInit() {
    this.twilioService.participants$.subscribe(participants => {
      this.participants = participants;
      this.attachParticipantTracks();
    });

    // Handle participant disconnection - remove their audio from mix
    this.twilioService.participantDisconnected$.subscribe(participantSid => {
      this.audioStreamingService.removeRemoteAudioTrack(participantSid);
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

    // Subscribe to live transcription updates
    this.audioStreamingService.transcription$.subscribe(transcriptions => {
      this.liveTranscription = transcriptions;
    });

    this.audioStreamingService.isRecording$.subscribe(isRecording => {
      this.isTranscribing = isRecording;
    });
  }

  ngOnDestroy() {
    // Disconnect without confirmation dialog when component is destroyed
    if (this.isConnected) {
      this.audioStreamingService.stopRecording();
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
      
      // Start live audio streaming for transcription
      try {
        await this.audioStreamingService.startRecording(this.roomSid);
        console.log('🎤 Live transcription started');
      } catch (streamError) {
        console.warn('Could not start live transcription:', streamError);
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
      
      // Stop live transcription and get final result
      let streamingTranscription = '';
      try {
        streamingTranscription = await this.audioStreamingService.stopRecording();
        console.log('📝 Final streaming transcription:', streamingTranscription.substring(0, 100) + '...');
      } catch (e) {
        console.warn('Error stopping streaming:', e);
      }
      
      this.twilioService.leaveRoom();
      this.chatService.leaveRoom(this.roomName, this.identity);
      this.isConnected = false;
      this.participants = [];
      this.messages = [];
      this.liveTranscription = [];
      
      // Redirect to transcription page with streaming data
      if (savedRoomSid) {
        this.router.navigate(['/transcription', savedRoomSid], {
          queryParams: { 
            roomName: savedRoomName,
            hasStreaming: streamingTranscription ? 'true' : 'false'
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
              this.audioStreamingService.addRemoteAudioTrack(participant.sid, mediaStreamTrack);
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
              this.audioStreamingService.addRemoteAudioTrack(participant.sid, mediaStreamTrack);
            }
          }
        });

        // Listen for unsubscribed tracks
        participant.on('trackUnsubscribed', track => {
          if (track.kind === 'audio') {
            this.audioStreamingService.removeRemoteAudioTrack(participant.sid);
          }
        });
      });
    }, 100);
  }
}