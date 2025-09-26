import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private stompClient: Client;
  private messagesSubject = new BehaviorSubject<any[]>([]);
  private currentRoom = '';
  
  messages$ = this.messagesSubject.asObservable();

  constructor() {
    this.stompClient = new Client({
      webSocketFactory: () => new SockJS('https://bca4088f72a8.ngrok-free.app/ws'),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });
    
    this.stompClient.onConnect = () => {
      console.log('Connected to chat server');
    };
    
    this.stompClient.activate();
  }

  joinRoom(roomName: string, userName: string) {
    this.currentRoom = roomName;
    
    // Subscribe to room messages
    this.stompClient.subscribe(`/topic/chat/${roomName}`, (message) => {
      const chatMessage = JSON.parse(message.body);
      const currentMessages = this.messagesSubject.value;
      this.messagesSubject.next([...currentMessages, chatMessage]);
    });
    
    // Send join room message
    this.stompClient.publish({
      destination: '/app/chat.joinRoom',
      body: JSON.stringify({ user: userName, room: roomName, text: '', time: '' })
    });
  }

  sendMessage(roomName: string, message: any) {
    const chatMessage = {
      ...message,
      room: roomName
    };
    
    this.stompClient.publish({
      destination: '/app/chat.sendMessage',
      body: JSON.stringify(chatMessage)
    });
  }

  leaveRoom(roomName: string, userName: string) {
    this.stompClient.publish({
      destination: '/app/chat.leaveRoom',
      body: JSON.stringify({ user: userName, room: roomName, text: '', time: '' })
    });
    
    this.messagesSubject.next([]);
    this.currentRoom = '';
  }
}