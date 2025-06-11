const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  usePairingCode
} = require('@whiskeysockets/baileys');
const sanitizeNumber = require('./utils/sanitizeNumber');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', (socket) => {
  socket.on('start-session', async (phoneNumber) => {
    try {
      const sanitized = sanitizeNumber(phoneNumber);
      const sessionPath = path.join(__dirname, '../sessions', sanitized);
      fs.mkdirSync(sessionPath, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, fs)
        },
        browser: ['Edge', 'Windows', '11.0'],
      });

      sock.ev.on('connection.update', async (update) => {
        if (update.pairingCode) {
          socket.emit('pairing-code', update.pairingCode);
        }
        if (update.connection === 'open') {
          await saveCreds();
          const credsPath = path.join(sessionPath, 'creds.json');
          await sock.sendMessage(sanitized + '@s.whatsapp.net', {
            document: fs.readFileSync(credsPath),
            mimetype: 'application/json',
            fileName: 'creds.json',
            caption: 'Your WhatsApp session file (creds.json)',
          });
          setTimeout(() => sock.logout(), 10000);
          socket.emit('success', 'Session file sent to your WhatsApp!');
        }
      });

      sock.ev.on('connection.close', (update) => {
        if (update.lastDisconnect && update.lastDisconnect.error) {
          socket.emit('error', 'Connection closed or failed. Please try again.');
        }
      });

      await usePairingCode(sock, sanitized);
    } catch (err) {
      socket.emit('error', 'An error occurred: ' + err.message);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
