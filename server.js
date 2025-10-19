const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Almacenamiento en memoria
const rooms = new Map();
const users = new Map();

// Configurar Socket.IO
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Unirse a una sala existente
  socket.on('join-room', (data) => {
    const { roomCode, username } = data;
    
    if (!rooms.has(roomCode)) {
      socket.emit('error', 'La sala no existe');
      return;
    }

    const room = rooms.get(roomCode);
    
    if (room.closed) {
      socket.emit('error', 'La sala está cerrada');
      return;
    }

    // Unir al usuario a la sala
    socket.join(roomCode);
    
    // Guardar información del usuario
    users.set(socket.id, {
      username,
      roomCode,
      isCreator: false
    });

    // Agregar usuario a la sala
    room.users.push({
      id: socket.id,
      username,
      joinedAt: new Date()
    });

    // Notificar a los demás usuarios
    socket.to(roomCode).emit('user-joined', {
      username,
      timestamp: new Date(),
      userCount: room.users.length
    });

    // VALIDAR Y ENVIAR HISTORIAL CORRECTAMENTE
    console.log('📤 Enviando historial a nuevo usuario:', username);
    console.log('📦 Mensajes en la sala:', room.messages.length);
    
    // Validar estructura de mensajes antes de enviar
    const validMessages = room.messages.filter(msg => 
      msg && msg.username && msg.content && msg.timestamp
    );
    
    console.log('✅ Mensajes válidos:', validMessages.length);
    
    // Enviar historial de mensajes al nuevo usuario
    socket.emit('message-history', validMessages);

    // Confirmar unión exitosa
    socket.emit('room-joined', {
      roomCode,
      username,
      isCreator: false,
      userCount: room.users.length
    });

    console.log(`Usuario ${username} se unió a la sala ${roomCode}`);
  });

  // Crear nueva sala personalizada
  socket.on('create-room', (data) => {
    const { username, roomCode } = data;

    // Validar código de sala
    if (!roomCode || roomCode.length < 2 || roomCode.length > 20) {
      socket.emit('error', 'El código de sala debe tener entre 2 y 20 caracteres');
      return;
    }

    // Verificar si la sala ya existe
    if (rooms.has(roomCode)) {
      socket.emit('error', 'Esta sala ya existe. Elige otro código.');
      return;
    }

    // Crear nueva sala
    const room = {
      code: roomCode,
      creator: socket.id,
      users: [],
      messages: [],
      closed: false,
      createdAt: new Date(),
      isCustom: true
    };

    rooms.set(roomCode, room);

    // Unir al creador a la sala
    socket.join(roomCode);

    // Guardar información del usuario
    users.set(socket.id, {
      username,
      roomCode,
      isCreator: true
    });

    // Agregar usuario a la sala
    room.users.push({
      id: socket.id,
      username,
      joinedAt: new Date()
    });

    // Confirmar creación exitosa
    socket.emit('room-created', {
      roomCode,
      username,
      isCreator: true,
      userCount: 1,
      isCustom: true
    });

    console.log(`Sala personalizada ${roomCode} creada por ${username}`);
  });

  // Crear sala aleatoria
  socket.on('create-random-room', (data) => {
    const { username } = data;
    
    // Generar código aleatorio de 4 dígitos
    let roomCode;
    do {
      roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(roomCode));

    // Crear nueva sala
    const room = {
      code: roomCode,
      creator: socket.id,
      users: [],
      messages: [],
      closed: false,
      createdAt: new Date(),
      isCustom: false
    };

    rooms.set(roomCode, room);

    // Unir al creador a la sala
    socket.join(roomCode);

    // Guardar información del usuario
    users.set(socket.id, {
      username,
      roomCode,
      isCreator: true
    });

    // Agregar usuario a la sala
    room.users.push({
      id: socket.id,
      username,
      joinedAt: new Date()
    });

    // Confirmar creación exitosa
    socket.emit('room-created', {
      roomCode,
      username,
      isCreator: true,
      userCount: 1,
      isCustom: false
    });

    console.log(`Sala aleatoria ${roomCode} creada por ${username}`);
  });

  // Enviar mensaje
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (!user) {
      console.log('❌ Usuario no encontrado para enviar mensaje');
      return;
    }

    const room = rooms.get(user.roomCode);
    if (!room || room.closed) {
      console.log('❌ Sala no encontrada o cerrada');
      return;
    }

    // CREAR MENSAJE CON ESTRUCTURA CORRECTA
    const message = {
      id: Date.now().toString(),
      username: user.username,
      content: data.content,
      timestamp: new Date().toISOString(), // Usar ISO string para mejor compatibilidad
      type: 'user-message'
    };

    console.log('💾 Guardando mensaje:', message);

    // Guardar mensaje
    room.messages.push(message);

    // Enviar a todos en la sala
    io.to(user.roomCode).emit('new-message', message);
    console.log('📢 Mensaje enviado a la sala:', user.roomCode);
  });

  // Cerrar sala (solo el creador)
  socket.on('close-room', () => {
    const user = users.get(socket.id);
    if (!user || !user.isCreator) return;

    const room = rooms.get(user.roomCode);
    if (!room) return;

    room.closed = true;

    // Notificar a todos los usuarios
    io.to(user.roomCode).emit('room-closed', {
      closedBy: user.username,
      timestamp: new Date()
    });

    // Desconectar a todos después de un tiempo
    setTimeout(() => {
      io.to(user.roomCode).emit('force-disconnect');
      io.in(user.roomCode).socketsLeave(user.roomCode);
      
      // Limpiar datos de la sala
      rooms.delete(user.roomCode);
    }, 5000);

    console.log(`Sala ${user.roomCode} cerrada por ${user.username}`);
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const room = rooms.get(user.roomCode);
      if (room) {
        // Remover usuario de la sala
        room.users = room.users.filter(u => u.id !== socket.id);
        
        // Notificar a los demás usuarios
        socket.to(user.roomCode).emit('user-left', {
          username: user.username,
          timestamp: new Date(),
          userCount: room.users.length
        });

      if (room.users.length === 0) {
    // Cerrar solo si NO QUEDAN USUARIOS
    console.log(`🚪 Cerrando sala ${user.roomCode} (sin usuarios)`);
    room.closed = true;
    
    setTimeout(() => {
        if (rooms.has(user.roomCode) && rooms.get(user.roomCode).users.length === 0) {
            rooms.delete(user.roomCode);
        }
    }, 30000);
    console.log(`🚪 Sala ${user.roomCode} (sin usuarios) ha sido cerrada`);
}
// Si hay usuarios pero el creador se fue, la sala sigue activa sin cambios
      }
      
      users.delete(socket.id);
    }
    
    console.log('Usuario desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});