# MeetingPortal

Aplicação Angular com integração Twilio Video para chamadas entre duas pessoas ou em grupo.

## Configuração Twilio

1. Crie uma conta no [Twilio Console](https://console.twilio.com/)
2. Obtenha suas credenciais:
   - Account SID
   - Auth Token
   - API Key SID
   - API Key Secret
3. Configure as variáveis no arquivo `server.js`

## Instalação

### Frontend (Angular)
```bash
npm install
```

### Backend (Node.js)
```bash
npm install --prefix . -f package-server.json
```

## Executar a aplicação

### 1. Iniciar o servidor backend
```bash
node server.js
```

### 2. Iniciar o frontend Angular
```bash
ng serve
```

## Funcionalidades

- ✅ Chamadas de vídeo 1:1
- ✅ Chamadas em grupo
- ✅ Áudio e vídeo em tempo real
- ✅ Interface simples e intuitiva

## Como usar

1. Digite seu nome
2. Digite o nome da sala
3. Clique em "Entrar na Chamada"
4. Compartilhe o nome da sala com outros participantes

## Tecnologias

- Angular 19
- Twilio Video SDK
- Node.js/Express
- TypeScript
