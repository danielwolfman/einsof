import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { PhysicsEngine } from './physics/engine';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const physicsEngine = new PhysicsEngine();

app.use(express.json());

app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running' });
});

// Handle game state updates
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('startGame', () => {
        physicsEngine.startGame();
    });

    socket.on('updatePosition', (data) => {
        physicsEngine.updateSpaceshipPosition(data);
        io.emit('gameState', physicsEngine.getGameState());
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});