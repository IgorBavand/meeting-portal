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
      apiKey: "AIzaSyDvniOl6_WzJ2BZzP0QO_PXjg9EI5HUaRU",
      authDomain: "meeting-portal-demo.firebaseapp.com",
      databaseURL: "https://meeting-portal-demo-default-rtdb.firebaseio.com",
      projectId: "meeting-portal-demo",
      storageBucket: "meeting-portal-demo.appspot.com",
      messagingSenderId: "987654321",
      appId: "1:987654321:web:demo123456789"
    };

    try {
      const app = initializeApp(firebaseConfig);
      this.db = getDatabase(app);
      console.log('🔥 Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Firebase initialization error:', error);
    }
  }

  initializeChat(token: string) {
    console.log('✅ Firebase chat initialized');
  }

  joinRoom(roomName: string, userName: string) {
    this.currentRoom = roomName;
    this.messagesRef = ref(this.db, `chats/${roomName}`);
    
    console.log(`🔄 Joining room: ${roomName}`);
    console.log(`🔄 Database ref:`, this.messagesRef);
    
    // Listen for messages
    onValue(this.messagesRef, (snapshot) => {
      console.log('💬 Firebase snapshot received:', snapshot.val());
      const data = snapshot.val();
      if (data) {
        const messages = Object.values(data).sort((a: any, b: any) => a.timestamp - b.timestamp);
        console.log('💬 Processed messages:', messages);
        this.messagesSubject.next(messages as any[]);
      } else {
        console.log('💬 No messages in room');
        this.messagesSubject.next([]);
      }
    }, (error) => {
      console.error('❌ Firebase onValue error:', error);
    });
    
    console.log(`✅ Joined Firebase chat room: ${roomName}`);
  }

  sendMessage(roomName: string, message: any) {
    if (this.messagesRef) {
      const messageData = {
        ...message,
        timestamp: Date.now()
      };
      
      console.log('💬 Sending message:', messageData);
      
      push(this.messagesRef, messageData)
        .then(() => {
          console.log('✅ Message sent to Firebase successfully');
        })
        .catch((error) => {
          console.error('❌ Error sending message:', error);
        });
    } else {
      console.error('❌ No messages ref available');
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