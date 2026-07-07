// Express + Socket.io entrypoint.
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';

const app = express();

// Client sends the session cookie, so CORS must allow credentials from its origin.
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', authRouter);

const server = http.createServer(app);

// Socket.io is wired up now; room/game events land here in Phase 2+.
const io = new SocketServer(server, {
  cors: { origin: config.clientOrigin, credentials: true },
});

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id);
  socket.on('disconnect', () => console.log('[socket] disconnected:', socket.id));
});

server.listen(config.port, () => {
  console.log(`[server] listening on http://127.0.0.1:${config.port}`);
  console.log(`[server] client origin: ${config.clientOrigin}`);
});
