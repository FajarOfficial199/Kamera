const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Data rooms
const rooms = new Map();

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
app.post('/api/create-room', (req, res) => {
  const roomCode = generateRoomCode();
  rooms.set(roomCode, {
    host: null,
    clients: new Map(),
    createdAt: Date.now(),
    lastActivity: Date.now()
  });
  
  console.log(`🎉 Room created: ${roomCode}`);
  res.json({ 
    success: true, 
    roomCode,
    message: 'Room berhasil dibuat!'
  });
});

// API untuk cek room
app.get('/api/check-room/:roomCode', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const roomExists = rooms.has(roomCode);
  
  if (roomExists) {
    const room = rooms.get(roomCode);
    res.json({ 
      exists: true, 
      clientsCount: room.clients.size,
      isActive: (Date.now() - room.lastActivity) < 3600000 // 1 jam
    });
  } else {
    res.json({ exists: false });
  }
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

// Bersihkan room yang tidak aktif setiap 5 menit
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  rooms.forEach((room, roomCode) => {
    if (now - room.lastActivity > 3600000) { // 1 jam
      rooms.delete(roomCode);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} inactive rooms`);
  }
}, 300000);

// Socket.io connection
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Host bergabung ke room
  socket.on('host-join', (roomCode) => {
    const normalizedCode = roomCode.toUpperCase();
    
    if (rooms.has(normalizedCode)) {
      const room = rooms.get(normalizedCode);
      room.host = socket.id;
      room.lastActivity = Date.now();
      
      socket.join(normalizedCode);
      socket.emit('host-joined', { 
        roomCode: normalizedCode,
        message: 'Berhasil menjadi host!'
      });
      
      console.log(`👑 Host ${socket.id} joined room ${normalizedCode}`);
    } else {
      socket.emit('error', { 
        message: 'Room tidak ditemukan!',
        code: 'ROOM_NOT_FOUND'
      });
    }
  });

  // Client bergabung ke room
  socket.on('client-join', (roomCode) => {
    const normalizedCode = roomCode.toUpperCase();
    
    if (rooms.has(normalizedCode)) {
      const room = rooms.get(normalizedCode);
      
      // Cek apakah room memiliki host
      if (!room.host) {
        socket.emit('error', { 
          message: 'Host belum terhubung!',
          code: 'NO_HOST'
        });
        return;
      }
      
      // Simpan data client
      room.clients.set(socket.id, {
        id: socket.id,
        connectedAt: Date.now(),
        cameraActive: false,
        flashlightOn: false,
        zoomLevel: 1
      });
      
      room.lastActivity = Date.now();
      
      socket.join(normalizedCode);
      socket.emit('client-joined', { 
        roomCode: normalizedCode,
        hostId: room.host,
        message: 'Berhasil terhubung ke room!'
      });
      
      // Beritahu host bahwa client baru bergabung
      io.to(room.host).emit('client-connected', {
        clientId: socket.id,
        totalClients: room.clients.size
      });
      
      console.log(`📱 Client ${socket.id} joined room ${normalizedCode}`);
    } else {
      socket.emit('error', { 
        message: 'Room tidak ditemukan!',
        code: 'ROOM_NOT_FOUND'
      });
    }
  });

  // Kontrol kamera dari host ke client
  socket.on('control-camera', (data) => {
    const { roomCode, clientId, action, value } = data;
    const normalizedCode = roomCode.toUpperCase();
    
    if (rooms.has(normalizedCode)) {
      const room = rooms.get(normalizedCode);
      
      // Pastikan pengirim adalah host
      if (socket.id === room.host) {
        room.lastActivity = Date.now();
        
        // Update status client jika ada
        if (room.clients.has(clientId)) {
          const client = room.clients.get(clientId);
          
          if (action === 'flashlight') {
            client.flashlightOn = value;
          } else if (action === 'zoom') {
            client.zoomLevel = value;
          } else if (action === 'camera') {
            client.cameraActive = value === 'start';
          }
          
          room.clients.set(clientId, client);
        }
        
        // Kirim perintah ke client tertentu
        io.to(clientId).emit('camera-control', { action, value });
        console.log(`🎮 Control sent to ${clientId}: ${action}=${value}`);
      }
    }
  });

  // Stream gambar dari client ke host
  socket.on('stream-image', (data) => {
    const { roomCode, imageData, metadata } = data;
    const normalizedCode = roomCode.toUpperCase();
    
    if (rooms.has(normalizedCode)) {
      const room = rooms.get(normalizedCode);
      room.lastActivity = Date.now();
      
      // Teruskan ke host
      io.to(room.host).emit('image-stream', { 
        clientId: socket.id, 
        imageData,
        metadata
      });
    }
  });

  // Screenshot request dari host
  socket.on('request-screenshot', (data) => {
    const { roomCode, clientId } = data;
    const normalizedCode = roomCode.toUpperCase();
    
    if (rooms.has(normalizedCode)) {
      io.to(clientId).emit('take-screenshot');
    }
  });

  // Screenshot result dari client
  socket.on('screenshot-result', (data) => {
    const { roomCode, imageData } = data;
    const normalizedCode = roomCode.toUpperCase();
    
    if (rooms.has(normalizedCode)) {
      const room = rooms.get(normalizedCode);
      io.to(room.host).emit('screenshot-received', {
        clientId: socket.id,
        imageData,
        timestamp: Date.now()
      });
    }
  });

  // Ping untuk menjaga koneksi
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Client meninggalkan room
  socket.on('leave-room', (roomCode) => {
    const normalizedCode = roomCode.toUpperCase();
    
    if (rooms.has(normalizedCode)) {
      const room = rooms.get(normalizedCode);
      
      if (socket.id === room.host) {
        // Host keluar - beri tahu semua client
        io.to(normalizedCode).emit('room-closed', {
          message: 'Host telah meninggalkan room'
        });
        
        // Hapus room
        rooms.delete(normalizedCode);
        console.log(`🗑️ Room ${normalizedCode} deleted by host`);
      } else if (room.clients.has(socket.id)) {
        // Client keluar
        room.clients.delete(socket.id);
        
        // Beri tahu host
        io.to(room.host).emit('client-disconnected', {
          clientId: socket.id,
          remainingClients: room.clients.size
        });
        
        console.log(`👋 Client ${socket.id} left room ${normalizedCode}`);
      }
      
      socket.leave(normalizedCode);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    // Hapus dari semua room
    rooms.forEach((room, roomCode) => {
      if (room.host === socket.id) {
        // Host keluar
        io.to(roomCode).emit('room-closed', {
          message: 'Host terputus'
        });
        
        rooms.delete(roomCode);
        console.log(`💥 Room ${roomCode} closed (host disconnected)`);
      } else if (room.clients.has(socket.id)) {
        // Client keluar
        room.clients.delete(socket.id);
        
        io.to(room.host).emit('client-disconnected', {
          clientId: socket.id,
          remainingClients: room.clients.size
        });
      }
    });
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Terjadi kesalahan pada server' 
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Access the app at http://localhost:${PORT}`);
});
