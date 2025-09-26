const { Server } = require('socket.io');

let io;

module.exports = (req, res) => {
  if (!io) {
    io = new Server(res.socket.server, {
      path: '/api/chat-server',
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    io.on('connection', (socket) => {
      console.log('User connected:', socket.id);

      socket.on('join-room', (roomName) => {
        socket.join(roomName);
        console.log(`User ${socket.id} joined room: ${roomName}`);
      });

      socket.on('send-message', (data) => {
        socket.to(data.room).emit('message', data.message);
      });

      socket.on('leave-room', (roomName) => {
        socket.leave(roomName);
        console.log(`User ${socket.id} left room: ${roomName}`);
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
      });
    });
  }

  res.end();
};