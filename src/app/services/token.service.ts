import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private apiUrl = 'https://meeting-api-production-e392.up.railway.app/api/v1/twilio';

  constructor(private http: HttpClient) { }

  getAccessToken(identity: string): Observable<string> {
    return this.http.get(`${this.apiUrl}/token/${identity}`, {
      responseType: 'text'
    }).pipe(
      catchError(error => {
        console.error('Erro ao obter token:', error);
        return throwError(() => new Error('Falha na comunicação com o servidor'));
      })
    );
  }

  /**
   * Get token for a specific room (creates room with recording if needed)
   */
  getAccessTokenForRoom(identity: string, roomName: string): Observable<string> {
    return this.http.get(`${this.apiUrl}/token/${identity}/room/${roomName}`, {
      responseType: 'text'
    }).pipe(
      catchError(error => {
        console.error('Erro ao obter token para sala:', error);
        return throwError(() => new Error('Falha na comunicação com o servidor'));
      })
    );
  }

  /**
   * Create room with recording enabled
   */
  createRoom(roomName: string): Observable<{sid: string, name: string, status: string}> {
    return this.http.post<{sid: string, name: string, status: string}>(`${this.apiUrl}/room/${roomName}`, {}).pipe(
      catchError(error => {
        console.error('Erro ao criar sala:', error);
        return throwError(() => new Error('Falha na comunicação com o servidor'));
      })
    );
  }
}
