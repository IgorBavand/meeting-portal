import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onValue, off } from 'firebase/database';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private db: any;
  private messagesSubject = new BehaviorSubject<any[]>([]);
  private currentRoom = '';
  private messagesRef: any;
  
  messages$ = this.messagesSubject.asObservable();

  constructor() {
    // Firebase config (público para demo)
    const firebaseConfig = {
      apiKey: "AIzaSyBvOyiA03ppVi-Qa88SUOxigXxaLD4xaMo",
      authDomain: "meeting-portal-chat.firebaseapp.com",
      databaseURL: "https://meeting-portal-chat-default-rtdb.firebaseio.com",
      projectId: "meeting-portal-chat",
      storageBucket: "meeting-portal-chat.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef123456"
    };

    const app = initializeApp(firebaseConfig);
    this.db = getDatabase(app);
  }

  initializeChat(token: string) {
    console.log('✅ Firebase chat initialized');
  }

  joinRoom(roomName: string, userName: string) {
    this.currentRoom = roomName;
    this.messagesRef = ref(this.db, `chats/${roomName}`);
    
    // Listen for messages
    onValue(this.messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const messages = Object.values(data);
        this.messagesSubject.next(messages as any[]);
      } else {
        this.messagesSubject.next([]);
      }
    });
    
    console.log(`✅ Joined Firebase chat room: ${roomName}`);
  }

  sendMessage(roomName: string, message: any) {
    if (this.messagesRef) {
      push(this.messagesRef, {
        ...message,
        timestamp: Date.now()
      });
      console.log('✅ Message sent to Firebase');
    }
  }

  leaveRoom(roomName: string, userName: string) {
    if (this.messagesRef) {
      off(this.messagesRef);
      this.messagesRef = null;
    }
    
    this.messagesSubject.next([]);
    this.currentRoom = '';
    
    console.log(`✅ Left Firebase chat room: ${roomName}`);
  }
}