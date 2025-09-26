import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VideoCallComponent } from './components/video-call.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, VideoCallComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'meeting portal';
}
