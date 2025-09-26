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
  
  messages$ = this.messagesSubject.asObservable();

  constructor() {
    // Inicialização lazy para evitar conflitos
  }

  private initSupabase() {
    if (this.supabase) return;
    
    const supabaseUrl = 'https://ybsojwpcokgwmlkpfhjb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlic29qd3Bjb2tnd21sa3BmaGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4NzE4MzMsImV4cCI6MjA3NDQ0NzgzM30.S2Y09IDUTME-e_0QEVF4QrSob5vwIHIYmtB41MDQ-OE';
    
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    console.log('✅ Supabase initialized');
  }

  initializeChat(token: string) {
    console.log('✅ Chat ready');
  }

  async joinRoom(roomName: string, userName: string) {
    this.initSupabase();
    this.currentRoom = roomName;
    
    // Load existing messages
    await this.loadMessages(roomName);
    
    // Listen for new messages in real-time
    this.supabase
      .channel(`chat_${roomName}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          console.log('📨 New message received:', payload.new);
          if (payload.new.room === roomName) {
            // Convert username back to user for display
            const messageForDisplay = {
              ...payload.new,
              user: payload.new.username
            };
            const currentMessages = this.messagesSubject.value;
            this.messagesSubject.next([...currentMessages, messageForDisplay]);
          }
        }
      )
      .subscribe();
    
    console.log(`✅ Joined Supabase room: ${roomName}`);
  }

  async sendMessage(roomName: string, message: any) {
    const messageData = {
      room: roomName,
      username: message.user,
      text: message.text,
      time: message.time,
      timestamp: Date.now(),
      created_at: new Date().toISOString()
    };
    
    console.log('💬 Sending message:', messageData);
    
    // Add to local immediately
    const currentMessages = this.messagesSubject.value;
    this.messagesSubject.next([...currentMessages, messageData]);
    
    // Send to Supabase (will trigger real-time for others)
    try {
      const { error } = await this.supabase
        .from('messages')
        .insert([messageData]);
      
      if (error) {
        console.error('❌ Supabase error:', error);
      } else {
        console.log('✅ Message sent to Supabase');
      }
    } catch (error) {
      console.error('❌ Network error:', error);
    }
  }

  async leaveRoom(roomName: string, userName: string) {
    // Unsubscribe from real-time
    this.supabase.removeAllChannels();
    
    this.messagesSubject.next([]);
    this.currentRoom = '';
    
    console.log(`✅ Left Supabase room: ${roomName}`);
  }

  private async loadMessages(roomName: string) {
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .select('*')
        .eq('room', roomName)
        .order('timestamp', { ascending: true });
      
      if (error) {
        console.error('❌ Error loading messages:', error);
        // Fallback to empty array
        this.messagesSubject.next([]);
      } else {
        // Convert username to user for display
        const messagesForDisplay = (data || []).map((msg: any) => ({
          ...msg,
          user: msg.username
        }));
        console.log('📨 Loaded messages:', messagesForDisplay);
        this.messagesSubject.next(messagesForDisplay);
      }
    } catch (error) {
      console.error('❌ Network error loading messages:', error);
      // Fallback to empty array
      this.messagesSubject.next([]);
    }
  }
}