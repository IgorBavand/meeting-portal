import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TwilioService } from '../services/twilio.service';
import { TokenService } from '../services/token.service';
import { ChatService } from '../services/chat.service';
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
  isConnected = false;
  participants: RemoteParticipant[] = [];
  isMuted = false;
  isVideoOff = false;
  showChat = false;
  newMessage = '';
  messages: {user: string, text: string, time: string}[] = [];
  
  predefinedRooms = ['Sala Geral', 'Reunião', 'Trabalho', 'Família', 'Amigos'];
  
  constructor(
    private twilioService: TwilioService,
    private tokenService: TokenService,
    private chatService: ChatService
  ) {}

  ngOnInit() {
    this.twilioService.participants$.subscribe(participants => {
      this.participants = participants;
      this.attachParticipantTracks();
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
  }

  ngOnDestroy() {
    this.leaveCall();
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
      console.log('Obtendo token para:', this.identity);
      const token = await this.tokenService.getAccessToken(this.identity).toPromise();
      console.log('Token recebido:', token);
      console.log('Token length:', token?.length);
      
      if (!token || token.trim() === '') {
        alert('Token vazio ou inválido');
        return;
      }
      
      console.log('Conectando na sala:', this.roomName);
      const room = await this.twilioService.joinRoom(token.trim(), this.roomName);
      this.isConnected = true;
      console.log('Conectado com sucesso');
      
      // Initialize and join chat room
      this.chatService.initializeChat(token.trim());
      this.chatService.joinRoom(this.roomName, this.identity);
      
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
      alert('Erro: ' + error.message);
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
      this.twilioService.leaveRoom();
      this.chatService.leaveRoom(this.roomName, this.identity);
      this.isConnected = false;
      this.participants = [];
      this.messages = [];
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
          }
        });
        
        // Escutar novos tracks
        participant.on('trackSubscribed', track => {
          if (track.kind === 'video') {
            container.appendChild(track.attach());
          } else if (track.kind === 'audio') {
            track.attach();
          }
        });
      });
    }, 100);
  }
}