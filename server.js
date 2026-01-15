const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Simpan data room
const rooms = new Map();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

// API untuk membuat room
app.post('/create-room', (req, res) => {
  const roomCode = generateRoomCode();
  rooms.set(roomCode, {
    host: null,
    clients: new Set(),
    cameraActive: false,
    flashlightOn: false,
    zoomLevel: 1
  });
  
  console.log(`Room created: ${roomCode}`);
  res.json({ roomCode });
});

// Fungsi untuk generate kode room
function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Host bergabung ke room
  socket.on('host-join', (roomCode) => {
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.host = socket.id;
      socket.join(roomCode);
      socket.emit('host-joined', roomCode);
      console.log(`Host ${socket.id} joined room ${roomCode}`);
    } else {
      socket.emit('error', 'Room tidak ditemukan');
    }
  });

  // Client bergabung ke room
  socket.on('client-join', (roomCode) => {
    if (rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.clients.add(socket.id);
      socket.join(roomCode);
      socket.emit('client-joined', roomCode);
      
      // Beritahu host bahwa client baru bergabung
      io.to(roomCode).emit('client-connected', socket.id);
      console.log(`Client ${socket.id} joined room ${roomCode}`);
    } else {
      socket.emit('error', 'Room tidak ditemukan');
    }
  });

  // Kontrol kamera dari host ke client
  socket.on('control-camera', (data) => {
    const { roomCode, action, value } = data;
    
    if (rooms.has(roomCode)) {
      // Kirim perintah ke semua client di room
      socket.to(roomCode).emit('camera-control', { action, value });
      
      // Update status room
      const room = rooms.get(roomCode);
      if (action === 'flashlight') {
        room.flashlightOn = value;
      } else if (action === 'zoom') {
        room.zoomLevel = value;
      }
    }
  });

  // Stream gambar dari client ke host
  socket.on('stream-image', (data) => {
    const { roomCode, imageData } = data;
    // Teruskan ke host
    socket.to(roomCode).emit('image-stream', { clientId: socket.id, imageData });
  });

  // Client meninggalkan room
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Hapus client dari semua room
    rooms.forEach((room, roomCode) => {
      if (room.host === socket.id) {
        // Host keluar, hapus room
        rooms.delete(roomCode);
        io.to(roomCode).emit('room-closed');
        console.log(`Room ${roomCode} closed`);
      } else if (room.clients.has(socket.id)) {
        // Client keluar
        room.clients.delete(socket.id);
        io.to(roomCode).emit('client-disconnected', socket.id);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
});
