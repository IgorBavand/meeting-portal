import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private apiUrl = 'https://02956d23e951.ngrok-free.app/api/v1/twilio';

  constructor(private http: HttpClient) {}

  getAccessToken(identity: string): Observable<string> {
    return this.http.get(`${this.apiUrl}/token/${identity}`, { 
      responseType: 'text',
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
  }
}