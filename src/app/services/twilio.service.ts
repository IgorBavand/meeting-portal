import { Injectable } from '@angular/core';
import { connect, Room, LocalTrack, RemoteParticipant, LocalParticipant } from 'twilio-video';
import { BehaviorSubject, Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TwilioService {
  private room?: Room;
  private localTracks: LocalTrack[] = [];
  
  private roomSubject = new BehaviorSubject<Room | null>(null);
  private participantsSubject = new BehaviorSubject<RemoteParticipant[]>([]);
  private participantDisconnectedSubject = new Subject<string>();
  
  room$ = this.roomSubject.asObservable();
  participants$ = this.participantsSubject.asObservable();
  participantDisconnected$ = this.participantDisconnectedSubject.asObservable();

  async joinRoom(token: string, roomName: string): Promise<Room> {
    try {
      const hasMedia = !!(navigator.mediaDevices?.getUserMedia);
      
      this.room = await connect(token, {
        name: roomName,
        audio: hasMedia,
        video: hasMedia ? { width: 640, height: 480 } : false
      });

      this.roomSubject.next(this.room);
      this.updateParticipants();
      this.setupRoomEvents();
      
      return this.room;
    } catch (error) {
      console.error('Erro ao conectar na sala:', error);
      throw error;
    }
  }



  leaveRoom(): void {
    if (this.room) {
      this.room.disconnect();
      this.room = undefined;
      this.roomSubject.next(null);
      this.participantsSubject.next([]);
    }
  }

  private setupRoomEvents(): void {
    if (!this.room) return;

    this.room.on('participantConnected', (participant: RemoteParticipant) => {
      this.updateParticipants();
    });

    this.room.on('participantDisconnected', (participant: RemoteParticipant) => {
      this.participantDisconnectedSubject.next(participant.sid);
      this.updateParticipants();
    });
  }

  private updateParticipants(): void {
    if (this.room) {
      this.participantsSubject.next(Array.from(this.room.participants.values()));
    }
  }

  getCurrentRoom(): Room | undefined {
    return this.room;
  }
}