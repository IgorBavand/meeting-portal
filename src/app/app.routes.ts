import { Routes } from '@angular/router';
import { VideoCallComponent } from './components/video-call.component';
import { TranscriptionComponent } from './components/transcription.component';

export const routes: Routes = [
  { path: '', component: VideoCallComponent },
  { path: 'transcription/:roomSid', component: TranscriptionComponent },
  { path: '**', redirectTo: '' }
];
