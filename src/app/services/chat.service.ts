import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private ws?: WebSocket;
  private messagesSubject = new BehaviorSubject<any[]>([]);
  private currentRoom = '';
  private currentUser = '';
  
  messages$ = this.messagesSubject.asObservable();

  initializeChat(token: string) {
    // WebSocket não precisa de token, apenas conecta
    console.log('✅ Chat initialized');
  }

  joinRoom(roomName: string, userName: string) {
    this.currentRoom = roomName;
    this.currentUser = userName;
    
    try {
      this.ws = new WebSocket('wss://bca4088f72a8.ngrok-free.app/ws');
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        // Send join message
        this.sendWebSocketMessage({
          type: 'join',
          room: roomName,
          user: userName
        });
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.room === roomName) {
            const currentMessages = this.messagesSubject.value;
            this.messagesSubject.next([...currentMessages, data.message]);
          }
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
      
      this.ws.onclose = () => {
        console.log('⚠️ WebSocket closed');
      };
      
    } catch (error) {
      console.error('❌ Error connecting to WebSocket:', error);
    }
  }

  sendMessage(roomName: string, message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWebSocketMessage({
        type: 'message',
        room: roomName,
        message: message
      });
    }
  }

  leaveRoom(roomName: string, userName: string) {
    if (this.ws) {
      this.sendWebSocketMessage({
        type: 'leave',
        room: roomName,
        user: userName
      });
      
      this.ws.close();
      this.ws = undefined;
    }
    
    this.messagesSubject.next([]);
    this.currentRoom = '';
    this.currentUser = '';
  }

  private sendWebSocketMessage(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}