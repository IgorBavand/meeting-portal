const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
const port = 3000;

// Configurações do Twilio - substitua pelas suas credenciais
const accountSid = 'your_account_sid';
const authToken = 'your_auth_token';
const apiKeySid = 'your_api_key_sid';
const apiKeySecret = 'your_api_key_secret';

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

app.use(cors());
app.use(express.json());

app.post('/api/token', (req, res) => {
  const { identity, roomName } = req.body;

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: identity
  });

  const videoGrant = new VideoGrant({
    room: roomName
  });

  token.addGrant(videoGrant);

  res.json({
    token: token.toJwt()
  });
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});