import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const ngrokHtmlInterceptor: HttpInterceptorFn = (req, next) => {
  // Adiciona headers necessários para ngrok
  const modifiedReq = req.clone({
    setHeaders: {
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': 'application/json'
    }
  });
  
  return next(modifiedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Verifica se a resposta é HTML (ngrok retorna HTML quando há problemas)
      const isHtmlResponse = error.error && typeof error.error === 'string' && 
        (error.error.includes('<!DOCTYPE html>') || 
         error.error.includes('<html>') ||
         error.error.includes('ngrok') ||
         error.error.includes('Visit site'));
      
      if (isHtmlResponse) {
        console.error('Ngrok retornou HTML ao invés de JSON:', error);
        
        // Cria um erro mais amigável
        const friendlyError = new HttpErrorResponse({
          error: { 
            message: 'Erro de conexão com o servidor. Verifique se o ngrok está funcionando corretamente.',
            originalError: 'HTML_RESPONSE_FROM_NGROK'
          },
          status: error.status || 502,
          statusText: error.statusText || 'Bad Gateway'
        });
        
        return throwError(() => friendlyError);
      }
      
      return throwError(() => error);
    })
  );
};