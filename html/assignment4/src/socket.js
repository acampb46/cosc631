const socketIo = require('socket.io');

module.exports = (server) => {
  const io = socketIo(server);

  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Join a room for an item (used for bidding updates)
    socket.on('joinItemRoom', (itemId) => {
      socket.join(`item-${itemId}`);
      console.log(`Client ${socket.id} joined room item-${itemId}`);
    });

    // Leave a room
    socket.on('leaveItemRoom', (itemId) => {
      socket.leave(`item-${itemId}`);
      console.log(`Client ${socket.id} left room item-${itemId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};
