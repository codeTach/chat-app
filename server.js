const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
//Starlyn Nunez + AI
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

    // Enviar historial de mensajes al nuevo usuario
    socket.emit('message-history', room.messages);

    // Confirmar unión exitosa
    socket.emit('room-joined', {
      roomCode,
      username,
      isCreator: false,
      userCount: room.users.length
    });

    console.log(`Usuario ${username} se unió a la sala ${roomCode}`);
  });

  // Crear nueva sala (MODIFICADO para salas personalizadas)
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
      isCustom: true // Marcar como sala personalizada
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

  // Crear sala aleatoria (OPCIONAL - para mantener la funcionalidad original)
  socket.on('create-random-room', (data) => {
    const { username } = data;
    
    // Generar código aleatorio de 4 dígitos (funcionalidad original)
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
    if (!user) return;

    const room = rooms.get(user.roomCode);
    if (!room || room.closed) return;

    const message = {
      id: Date.now().toString(),
      username: user.username,
      content: data.content,
      timestamp: new Date(),
      type: 'user-message'
    };

    // Guardar mensaje
    room.messages.push(message);

    // Enviar a todos en la sala
    io.to(user.roomCode).emit('new-message', message);
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

        // Si el creador se desconecta y es sala personalizada, mantenerla abierta
        if (user.isCreator && room.users.length > 0 && !room.isCustom) {
          room.closed = true;
          io.to(user.roomCode).emit('room-closed', {
            closedBy: 'Sistema (creador desconectado)',
            timestamp: new Date()
          });
        }

        // Si no quedan usuarios y no es sala personalizada, eliminar la sala
        if (room.users.length === 0 && !room.isCustom) {
          rooms.delete(user.roomCode);
        }
      }
      
      users.delete(socket.id);
    }
    
    console.log('Usuario desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});