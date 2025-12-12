import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {

  handleError(error: any): string {
    if (error instanceof HttpErrorResponse) {
      // Erro específico do ngrok
      if (error.error?.originalError === 'HTML_RESPONSE_FROM_NGROK') {
        return 'Erro de conexão: O servidor ngrok não está respondendo corretamente. Verifique se o túnel está ativo.';
      }
      
      // Outros erros HTTP
      switch (error.status) {
        case 0:
          return 'Erro de conexão: Verifique sua internet e se o servidor está rodando.';
        case 404:
          return 'Recurso não encontrado no servidor.';
        case 500:
          return 'Erro interno do servidor.';
        case 502:
        case 503:
          return 'Servidor temporariamente indisponível.';
        default:
          return `Erro HTTP ${error.status}: ${error.message}`;
      }
    }
    
    // Erro genérico
    return error?.message || 'Erro desconhecido';
  }
}