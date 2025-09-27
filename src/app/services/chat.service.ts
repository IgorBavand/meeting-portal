import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { createClient } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private supabase: any;
  private messagesSubject = new BehaviorSubject<any[]>([]);
  private currentRoom = '';
  private channel: any;
  
  messages$ = this.messagesSubject.asObservable();

  constructor() {
    const supabaseUrl = 'https://ybsojwpcokgwmlkpfhjb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlic29qd3Bjb2tnd21sa3BmaGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzE4MzMsImV4cCI6MjA3NDQ0NzgzM30.S2Y09IDUTME-e_0QEVF4QrSob5vwIHIYmtB41MDQ-OE';
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔥 Supabase initialized');
  }

  initializeChat(token: string) {
    console.log('✅ Supabase Realtime ready');
  }

  async joinRoom(roomName: string, userName: string) {
    this.currentRoom = roomName;
    
    // Load existing messages first
    await this.loadMessages(roomName);
    
    // Create realtime channel for this room
    this.channel = this.supabase.channel(`room_${roomName}`, {
      config: {
        broadcast: { self: true },
        presence: { key: userName }
      }
    });
    
    // Listen for broadcast messages (INSTANT)
    this.channel.on('broadcast', { event: 'message' }, (payload: any) => {
      console.log('⚡ INSTANT message received:', payload.payload);
      
      if (payload.payload.room === roomName) {
        const currentMessages = this.messagesSubject.value;
        // Avoid duplicates
        const messageExists = currentMessages.some(msg => 
          msg.timestamp === payload.payload.timestamp && 
          msg.user === payload.payload.user
        );
        
        if (!messageExists) {
          this.messagesSubject.next([...currentMessages, payload.payload]);
        }
      }
    });
    
    // Subscribe to the channel
    this.channel.subscribe((status: string) => {
      console.log('🔌 Channel status:', status);
      if (status === 'SUBSCRIBED') {
        console.log(`⚡ REALTIME connected to room: ${roomName}`);
      }
    });
    
    console.log(`✅ Joined Supabase Realtime room: ${roomName}`);
  }

  async sendMessage(roomName: string, message: any) {
    const messageData = {
      ...message,
      room: roomName,
      timestamp: Date.now(),
      id: `${Date.now()}_${Math.random()}`
    };
    
    console.log('💬 Broadcasting message:', messageData);
    
    // Broadcast INSTANTLY to all connected clients
    if (this.channel) {
      await this.channel.send({
        type: 'broadcast',
        event: 'message',
        payload: messageData
      });
      console.log('⚡ Message broadcasted INSTANTLY');
    }
    
    // Also save to database for persistence (async, doesn't block)
    this.saveToDatabase(messageData);
  }

  private async saveToDatabase(messageData: any) {
    try {
      const { error } = await this.supabase
        .from('messages')
        .insert([{
          room: messageData.room,
          username: messageData.user,
          text: messageData.text,
          time: messageData.time,
          timestamp: messageData.timestamp
        }]);
      
      if (error) {
        console.warn('⚠️ Database save failed (but realtime worked):', error);
      } else {
        console.log('💾 Message saved to database');
      }
    } catch (error) {
      console.warn('⚠️ Database error (but realtime worked):', error);
    }
  }

  async leaveRoom(roomName: string, userName: string) {
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }
    
    this.messagesSubject.next([]);
    this.currentRoom = '';
    
    console.log(`✅ Left Supabase Realtime room: ${roomName}`);
  }

  private async loadMessages(roomName: string) {
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .select('*')
        .eq('room', roomName)
        .order('timestamp', { ascending: true })
        .limit(50); // Last 50 messages
      
      if (!error && data) {
        const messagesForDisplay = data.map((msg: any) => ({
          ...msg,
          user: msg.username
        }));
        console.log('📨 Loaded messages from database:', messagesForDisplay);
        this.messagesSubject.next(messagesForDisplay);
      }
    } catch (error) {
      console.warn('⚠️ Could not load message history:', error);
      this.messagesSubject.next([]);
    }
  }
}
