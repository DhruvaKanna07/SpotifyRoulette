// Express + Socket.io entrypoint.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { registerRoomHandlers } from './rooms/socket.js';

const app = express();

// Behind Render's TLS-terminating proxy, so trust it (correct client IP +
// lets `secure` cookies work over the proxied connection).
app.set('trust proxy', 1);

// Client sends the session cookie, so CORS must allow credentials from its origin.
// In production the client is served from THIS same origin, so CORS is a no-op,
// but keeping it is harmless and preserves the split dev setup.
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', authRouter);

// --- Serve the built client (production) ------------------------------------
// In dev the Vite server (:5173) serves the client and proxies /api + /socket.io
// here. In production there is no Vite: Express serves client/dist and falls back
// to index.html for client-side routes (/, /callback, /me, /setup, /room/:code).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  // SPA fallback: anything that isn't an API/socket route returns the app shell.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`[server] serving client from ${clientDist}`);
} else {
  console.log('[server] no client build found — dev mode (Vite serves the client)');
}

const server = http.createServer(app);

// Socket.io is wired up now; room/game events land here in Phase 2+.
const io = new SocketServer(server, {
  cors: { origin: config.clientOrigin, credentials: true },
});

registerRoomHandlers(io);

server.listen(config.port, () => {
  console.log(`[server] listening on port ${config.port}`);
  console.log(`[server] client origin: ${config.clientOrigin}`);
});
