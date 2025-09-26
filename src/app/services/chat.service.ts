import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Client as ConversationsClient } from '@twilio/conversations';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private conversationsClient?: ConversationsClient;
  private conversation?: any;
  private messagesSubject = new BehaviorSubject<any[]>([]);
  
  messages$ = this.messagesSubject.asObservable();

  async initializeChat(token: string) {
    try {
      this.conversationsClient = new ConversationsClient(token);
      console.log('✅ Twilio Conversations initialized');
    } catch (error) {
      console.error('❌ Error initializing chat:', error);
    }
  }

  async joinRoom(roomName: string, userName: string) {
    if (!this.conversationsClient) return;
    
    try {
      // Get or create conversation
      this.conversation = await this.conversationsClient.getConversationByUniqueName(roomName)
        .catch(() => this.conversationsClient!.createConversation({ uniqueName: roomName }));
      
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