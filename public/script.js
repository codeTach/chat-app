class ChatApp {
    constructor() {
        this.socket = null;
        this.currentRoom = null;
        this.currentUser = null;
        this.isCreator = false;
        this.isCustomRoom = false;
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        // Pantallas
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.chatScreen = document.getElementById('chat-screen');
        
        // Formulario de bienvenida
        this.usernameInput = document.getElementById('username');
        this.roomCodeInput = document.getElementById('room-code');
        this.customRoomCodeInput = document.getElementById('custom-room-code');
        this.createRoomBtn = document.getElementById('create-custom-room-btn');
        this.createRandomRoomBtn = document.getElementById('create-random-room-btn');
        this.joinRoomBtn = document.getElementById('join-room-btn');
        this.formMessage = document.getElementById('form-message');
        
        // Chat
        this.currentRoomCode = document.getElementById('current-room-code');
        this.userCount = document.getElementById('user-count');
        this.roomStatusBadge = document.getElementById('room-status-badge');
        this.roomTypeBadge = document.getElementById('room-type-badge');
        this.messagesContainer = document.getElementById('messages-container');
        this.messageInput = document.getElementById('message-input');
        this.sendBtn = document.getElementById('send-btn');
        this.closeRoomBtn = document.getElementById('close-room-btn');
        this.leaveRoomBtn = document.getElementById('leave-room-btn');
    }

    initializeEventListeners() {
        // Botones de la pantalla de bienvenida
        this.createRoomBtn.addEventListener('click', () => this.createCustomRoom());
        this.createRandomRoomBtn.addEventListener('click', () => this.createRandomRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        
        // Enter en los inputs
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createCustomRoom();
        });
        
        this.customRoomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createCustomRoom();
        });
        
        this.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        // Chat
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        this.closeRoomBtn.addEventListener('click', () => this.closeRoom());
        this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
    }

    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Conectado al servidor');
            this.showSystemMessage('✅ Conectado al servidor', 'info');
        });
        
        this.socket.on('disconnect', () => {
            this.showSystemMessage('❌ Desconectado del servidor', 'error');
        });
        
        this.socket.on('error', (error) => {
            this.showSystemMessage(`❌ ${error}`, 'error');
        });
        
        this.socket.on('room-created', (data) => {
            this.handleRoomJoined(data, true);
        });
        
        this.socket.on('room-joined', (data) => {
            this.handleRoomJoined(data, false);
        });
        
        this.socket.on('new-message', (message) => {
            this.displayMessage(message, message.username === this.currentUser);
        });
        
        this.socket.on('message-history', (messages) => {
            this.messagesContainer.innerHTML = '';
            if (messages.length === 0) {
                this.showSystemMessage('💬 Esta sala está vacía. ¡Sé el primero en enviar un mensaje!', 'info');
            } else {
                messages.forEach(message => {
                    this.displayMessage(message, message.username === this.currentUser);
                });
                this.scrollToBottom();
            }
        });
        
        this.socket.on('user-joined', (data) => {
            this.showSystemMessage(`👤 ${data.username} se ha unido a la sala`, 'info');
            this.updateUserCount(data.userCount);
        });
        
        this.socket.on('user-left', (data) => {
            this.showSystemMessage(`👋 ${data.username} ha abandonado la sala`, 'info');
            this.updateUserCount(data.userCount);
        });
        
        this.socket.on('room-closed', (data) => {
            this.roomStatusBadge.textContent = 'Cerrada';
            this.roomStatusBadge.className = 'status-badge closed';
            this.closeRoomBtn.disabled = true;
            this.messageInput.disabled = true;
            this.sendBtn.disabled = true;
            
            this.showSystemMessage(`🚫 La sala ha sido cerrada por ${data.closedBy}. Serás desconectado en 5 segundos.`, 'warning');
        });
        
        this.socket.on('force-disconnect', () => {
            this.leaveRoom();
        });
    }

    validateInputs() {
        const username = this.usernameInput.value.trim();
        
        if (!username) {
            this.showFormMessage('❌ Por favor ingresa tu nombre', 'error');
            return false;
        }
        
        if (username.length < 2) {
            this.showFormMessage('❌ El nombre debe tener al menos 2 caracteres', 'error');
            return false;
        }
        
        return true;
    }

    createCustomRoom() {
        if (!this.validateInputs()) return;
        
        const username = this.usernameInput.value.trim();
        const roomCode = this.customRoomCodeInput.value.trim();
        
        if (!roomCode || roomCode.length < 2) {
            this.showFormMessage('❌ El nombre de la sala debe tener al menos 2 caracteres', 'error');
            return;
        }
        
        if (!this.socket) {
            this.initializeSocket();
        }
        
        this.showFormMessage('⏳ Creando sala personalizada...', 'info');
        this.socket.emit('create-room', { username, roomCode });
    }

    createRandomRoom() {
        if (!this.validateInputs()) return;
        
        const username = this.usernameInput.value.trim();
        
        if (!this.socket) {
            this.initializeSocket();
        }
        
        this.showFormMessage('⏳ Creando sala rápida...', 'info');
        this.socket.emit('create-random-room', { username });
    }

    joinRoom() {
        if (!this.validateInputs()) return;
        
        const username = this.usernameInput.value.trim();
        const roomCode = this.roomCodeInput.value.trim();
        
        if (!roomCode) {
            this.showFormMessage('❌ Por favor ingresa el código de la sala', 'error');
            return;
        }
        
        if (!this.socket) {
            this.initializeSocket();
        }
        
        this.showFormMessage('⏳ Uniéndose a la sala...', 'info');
        this.socket.emit('join-room', { roomCode, username });
    }

    handleRoomJoined(data, isCreator) {
        this.currentRoom = data.roomCode;
        this.currentUser = data.username;
        this.isCreator = isCreator;
        this.isCustomRoom = data.isCustom || false;
        
        // Actualizar UI
        this.currentRoomCode.textContent = this.currentRoom;
        this.updateUserCount(data.userCount);
        
        // Mostrar tipo de sala
        if (this.isCustomRoom) {
            this.roomTypeBadge.textContent = 'Personalizada';
            this.roomTypeBadge.style.display = 'inline-block';
        } else {
            this.roomTypeBadge.style.display = 'none';
        }
        
        if (this.isCreator) {
            this.closeRoomBtn.classList.remove('hidden');
        } else {
            this.closeRoomBtn.classList.add('hidden');
        }
        
        // Cambiar a pantalla de chat
        this.welcomeScreen.classList.remove('active');
        this.chatScreen.classList.add('active');
        
        // Limpiar mensajes anteriores
        this.messagesContainer.innerHTML = '';
        
        // Mostrar mensaje de bienvenida
        const roomType = this.isCustomRoom ? 'personalizada' : 'rápida';
        this.showSystemMessage(`🎉 Te has unido a la sala ${roomType} "${this.currentRoom}" como ${this.currentUser}`, 'info');
        
        // Mostrar información para compartir si es el creador
        if (this.isCreator && this.isCustomRoom) {
            this.showSystemMessage(`💡 Comparte este código con tus amigos: "${this.currentRoom}"`, 'info');
        }
        
        // Enfocar el input de mensaje con delay
        setTimeout(() => {
            this.messageInput.focus();
            this.scrollToBottom();
        }, 300);
    }

    sendMessage() {
        const content = this.messageInput.value.trim();
        
        if (!content) return;
        
        this.socket.emit('send-message', { content });
        this.messageInput.value = '';
        this.messageInput.focus();
    }

    displayMessage(message, isOwnMessage) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOwnMessage ? 'own-message' : 'other-message'}`;

        const time = new Date(message.timestamp);
        const timeString = time.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="sender-name">${message.username}</span>
                <span class="message-time">${timeString}</span>
            </div>
            <div class="message-content">${message.content}</div>
        `;

        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    scrollToBottom() {
        setTimeout(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 100);
    }

    showSystemMessage(content, type = 'info') {
        const messageElement = document.createElement('div');
        messageElement.className = `system-message ${type}`;
        messageElement.textContent = content;
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    closeRoom() {
        if (confirm('¿Estás seguro de que quieres cerrar la sala? Todos los usuarios serán desconectados.')) {
            this.socket.emit('close-room');
        }
    }

    leaveRoom() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        // Resetear estado
        this.currentRoom = null;
        this.currentUser = null;
        this.isCreator = false;
        this.isCustomRoom = false;
        
        // Volver a pantalla de bienvenida
        this.chatScreen.classList.remove('active');
        this.welcomeScreen.classList.add('active');
        
        // Limpiar formularios
        this.roomCodeInput.value = '';
        this.customRoomCodeInput.value = '';
        this.messageInput.value = '';
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
        
        // Ocultar badge de tipo de sala
        this.roomTypeBadge.style.display = 'none';
    }

    updateUserCount(count) {
        this.userCount.textContent = count;
    }

    showFormMessage(message, type) {
        this.formMessage.textContent = message;
        this.formMessage.className = `message-form ${type}`;
        this.formMessage.classList.remove('hidden');
        
        setTimeout(() => {
            this.formMessage.classList.add('hidden');
        }, 4000);
    }
}

// Inicializar la aplicación cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});