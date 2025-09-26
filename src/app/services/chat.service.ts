import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

declare const Twilio: any;

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private conversationsClient: any;
  private conversation: any;
  private messagesSubject = new BehaviorSubject<any[]>([]);
  
  messages$ = this.messagesSubject.asObservable();

  async initializeChat(token: string) {
    try {
      // Load Twilio Conversations SDK dynamically
      if (!window.Twilio?.Conversations) {
        await this.loadTwilioConversationsSDK();
      }
      
      this.conversationsClient = new window.Twilio.Conversations.Client(token);
      console.log('✅ Twilio Conversations initialized');
    } catch (error) {
      console.error('❌ Error initializing Conversations:', error);
    }
  }

  private loadTwilioConversationsSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Twilio?.Conversations) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://sdk.twilio.com/js/conversations/releases/2.4.0/twilio-conversations.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Twilio Conversations SDK'));
      document.head.appendChild(script);
    });
  }

  async joinRoom(roomName: string, userName: string) {
    if (!this.conversationsClient) return;
    
    try {
      // Get or create conversation
      this.conversation = await this.conversationsClient.getConversationByUniqueName(roomName)
        .catch(() => this.conversationsClient.createConversation({ uniqueName: roomName }));
      
      // Join conversation
      await this.conversation.join();
      
      // Listen for messages
      this.conversation.on('messageAdded', (message: any) => {
        const chatMessage = {
          user: message.author,
          text: message.body,
          time: new Date(message.dateCreated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        
        const currentMessages = this.messagesSubject.value;
        this.messagesSubject.next([...currentMessages, chatMessage]);
      });
      
      console.log(`✅ Joined chat room: ${roomName}`);
    } catch (error) {
      console.error('❌ Error joining room:', error);
    }
  }

  async sendMessage(roomName: string, message: any) {
    if (!this.conversation) return;
    
    try {
      await this.conversation.sendMessage(message.text);
      console.log('✅ Message sent via Twilio Conversations');
    } catch (error) {
      console.error('❌ Error sending message:', error);
    }
  }

  async leaveRoom(roomName: string, userName: string) {
    if (this.conversation) {
      try {
        await this.conversation.leave();
        this.conversation = undefined;
        this.messagesSubject.next([]);
        console.log(`✅ Left chat room: ${roomName}`);
      } catch (error) {
        console.error('❌ Error leaving room:', error);
      }
    }
  }
}

declare global {
  interface Window {
    Twilio: any;
  }
}