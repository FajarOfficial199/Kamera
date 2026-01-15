class HostController {
    constructor() {
        this.socket = io();
        this.roomCode = '';
        this.clients = new Map();
        this.currentClientId = null;
        this.isCameraActive = false;
        this.isFlashlightOn = false;
        this.zoomLevel = 1;
        this.streamInterval = null;
        
        this.init();
        this.bindEvents();
    }
    
    init() {
        this.showToast('Host Controller siap', 'info');
        this.updateConnectionStatus('disconnected');
    }
    
    bindEvents() {
        // Room Creation
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('copyCodeBtn')?.addEventListener('click', () => this.copyRoomCode());
        document.getElementById('shareCodeBtn')?.addEventListener('click', () => this.shareRoomCode());
        
        // Controls
        document.getElementById('toggleCameraBtn')?.addEventListener('click', () => this.toggleCamera());
        document.getElementById('flashlightBtn')?.addEventListener('click', () => this.toggleFlashlight());
        document.getElementById('screenshotBtn')?.addEventListener('click', () => this.takeScreenshot());
        document.getElementById('zoomSlider')?.addEventListener('input', (e) => this.handleZoom(e));
        
        // Room Management
        document.getElementById('leaveRoomBtn')?.addEventListener('click', () => this.leaveRoom());
        
        // Screenshot Modal
        document.getElementById('closeScreenshotBtn')?.addEventListener('click', () => this.closeScreenshot());
        document.getElementById('downloadScreenshotBtn')?.addEventListener('click', () => this.downloadScreenshot());
        
        // Socket Events
        this.bindSocketEvents();
    }
    
    bindSocketEvents() {
        // Host joined room
        this.socket.on('host-joined', (data) => {
            this.roomCode = data.roomCode;
            this.showToast('Berhasil menjadi host!', 'success');
            this.updateConnectionStatus('connected');
        });
        
        // Client connected
        this.socket.on('client-connected', (data) => {
            this.addClient(data.clientId);
            this.showToast(`Client terhubung: ${data.clientId.substring(0, 8)}`, 'success');
            
            if (this.currentClientId === null) {
                this.selectClient(data.clientId);
            }
        });
        
        // Client disconnected
        this.socket.on('client-disconnected', (data) => {
            this.removeClient(data.clientId);
            
            if (this.currentClientId === data.clientId) {
                this.currentClientId = null;
                this.hideControls();
            }
            
            if (data.remainingClients === 0) {
                this.showToast('Semua client terputus', 'warning');
            }
        });
        
        // Image stream from client
        this.socket.on('image-stream', (data) => {
            if (data.clientId === this.currentClientId) {
                this.updateVideoFeed(data.imageData);
            }
        });
        
        // Screenshot received
        this.socket.on('screenshot-received', (data) => {
            this.showScreenshot(data.imageData);
            this.showToast('Screenshot berhasil diambil', 'success');
        });
        
        // Room closed
        this.socket.on('room-closed', (data) => {
            this.showToast(data.message, 'info');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        });
        
        // Error handling
        this.socket.on('error', (data) => {
            this.showToast(data.message, 'error');
        });
    }
    
    async createRoom() {
        try {
            const response = await fetch('/api/create-room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.roomCode = data.roomCode;
                this.showRoomCreated();
                this.socket.emit('host-join', this.roomCode);
            } else {
                throw new Error(data.message || 'Gagal membuat room');
            }
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        }
    }
    
    showRoomCreated() {
        document.getElementById('createRoomSection').classList.add('hidden');
        document.getElementById('roomCreatedSection').classList.remove('hidden');
        document.getElementById('roomCodeDisplay').textContent = this.roomCode;
    }
    
    addClient(clientId) {
        this.clients.set(clientId, {
            id: clientId,
            name: `Client ${this.clients.size + 1}`,
            connectedAt: Date.now(),
            active: true
        });
        
        this.updateClientsList();
        this.showClientsSection();
    }
    
    removeClient(clientId) {
        this.clients.delete(clientId);
        this.updateClientsList();
        
        if (this.clients.size === 0) {
            this.hideClientsSection();
        }
    }
    
    selectClient(clientId) {
        this.currentClientId = clientId;
        this.showControls();
        
        // Reset controls
        this.isCameraActive = false;
        this.isFlashlightOn = false;
        this.zoomLevel = 1;
        
        // Update UI
        document.getElementById('currentClientName').textContent = 
            this.clients.get(clientId)?.name || 'Client';
        document.getElementById('toggleCameraBtn').innerHTML = 
            '<i class="fas fa-video"></i><span>Hidupkan Kamera</span>';
        document.getElementById('flashlightBtn').innerHTML = 
            '<i class="fas fa-lightbulb"></i><span>Nyalakan Senter</span>';
        document.getElementById('zoomSlider').value = 1;
        document.getElementById('zoomValue').textContent = '1.0x';
        
        this.showToast(`Mengontrol ${this.clients.get(clientId)?.name}`, 'info');
    }
    
    updateClientsList() {
        const container = document.getElementById('clientsList');
        const countElement = document.getElementById('clientCount');
        
        if (!container) return;
        
        container.innerHTML = '';
        countElement.textContent = `${this.clients.size} client${this.clients.size !== 1 ? 's' : ''}`;
        
        this.clients.forEach((client, clientId) => {
            const clientElement = document.createElement('div');
            clientElement.className = 'client-item';
            clientElement.innerHTML = `
                <div class="client-info">
                    <div class="client-avatar">${client.name.charAt(client.name.length - 1)}</div>
                    <div>
                        <div style="font-weight: 600;">${client.name}</div>
                        <div class="client-status">
                            <span class="status-dot ${client.active ? 'online' : 'offline'}"></span>
                            <span>${client.active ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>
                </div>
                <div class="client-controls">
                    <button class="btn btn-sm ${this.currentClientId === clientId ? 'active' : ''}" 
                            onclick="hostController.selectClient('${clientId}')">
                        <i class="fas fa-video"></i> Kontrol
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="hostController.requestScreenshot('${clientId}')">
                        <i class="fas fa-camera"></i>
                    </button>
                </div>
            `;
            container.appendChild(clientElement);
        });
    }
    
    showClientsSection() {
        document.getElementById('clientsSection').classList.remove('hidden');
    }
    
    hideClientsSection() {
        document.getElementById('clientsSection').classList.add('hidden');
    }
    
    showControls() {
        document.getElementById('controlsSection').classList.remove('hidden');
    }
    
    hideControls() {
        document.getElementById('controlsSection').classList.add('hidden');
        document.getElementById('videoFeed').src = '';
    }
    
    toggleCamera() {
        if (!this.currentClientId) {
            this.showToast('Pilih client terlebih dahulu', 'warning');
            return;
        }
        
        this.isCameraActive = !this.isCameraActive;
        const action = this.isCameraActive ? 'start' : 'stop';
        
        this.socket.emit('control-camera', {
            roomCode: this.roomCode,
            clientId: this.currentClientId,
            action: 'camera',
            value: action
        });
        
        // Update button
        const button = document.getElementById('toggleCameraBtn');
        button.innerHTML = this.isCameraActive ? 
            '<i class="fas fa-video-slash"></i><span>Matikan Kamera</span>' :
            '<i class="fas fa-video"></i><span>Hidupkan Kamera</span>';
        button.classList.toggle('active', this.isCameraActive);
        
        this.showToast(`Kamera ${this.isCameraActive ? 'dihidupkan' : 'dimatikan'}`, 'info');
    }
    
    toggleFlashlight() {
        if (!this.currentClientId) {
            this.showToast('Pilih client terlebih dahulu', 'warning');
            return;
        }
        
        this.isFlashlightOn = !this.isFlashlightOn;
        
        this.socket.emit('control-camera', {
            roomCode: this.roomCode,
            clientId: this.currentClientId,
            action: 'flashlight',
            value: this.isFlashlightOn
        });
        
        // Update button
        const button = document.getElementById('flashlightBtn');
        button.innerHTML = this.isFlashlightOn ? 
            '<i class="fas fa-lightbulb"></i><span>Matikan Senter</span>' :
            '<i class="fas fa-lightbulb"></i><span>Nyalakan Senter</span>';
        button.classList.toggle('active', this.isFlashlightOn);
        
        this.showToast(`Senter ${this.isFlashlightOn ? 'dinyalakan' : 'dimatikan'}`, 'info');
    }
    
    handleZoom(event) {
        if (!this.currentClientId) {
            this.showToast('Pilih client terlebih dahulu', 'warning');
            return;
        }
        
        this.zoomLevel = parseFloat(event.target.value);
        document.getElementById('zoomValue').textContent = `${this.zoomLevel.toFixed(1)}x`;
        
        this.socket.emit('control-camera', {
            roomCode: this.roomCode,
            clientId: this.currentClientId,
            action: 'zoom',
            value: this.zoomLevel
        });
    }
    
    takeScreenshot() {
        if (!this.currentClientId) {
            this.showToast('Pilih client terlebih dahulu', 'warning');
            return;
        }
        
        this.socket.emit('request-screenshot', {
            roomCode: this.roomCode,
            clientId: this.currentClientId
        });
        
        this.showToast('Meminta screenshot...', 'info');
    }
    
    requestScreenshot(clientId) {
        this.socket.emit('request-screenshot', {
            roomCode: this.roomCode,
            clientId: clientId
        });
        
        this.showToast('Meminta screenshot...', 'info');
    }
    
    updateVideoFeed(imageData) {
        const videoFeed = document.getElementById('videoFeed');
        videoFeed.src = imageData;
    }
    
    showScreenshot(imageData) {
        const modal = document.getElementById('screenshotModal');
        const image = document.getElementById('screenshotImage');
        
        image.src = imageData;
        modal.classList.remove('hidden');
    }
    
    closeScreenshot() {
        document.getElementById('screenshotModal').classList.add('hidden');
    }
    
    downloadScreenshot() {
        const image = document.getElementById('screenshotImage');
        const link = document.createElement('a');
        link.href = image.src;
        link.download = `screenshot-${Date.now()}.jpg`;
        link.click();
    }
    
    copyRoomCode() {
        navigator.clipboard.writeText(this.roomCode)
            .then(() => this.showToast('Kode room disalin!', 'success'))
            .catch(() => this.showToast('Gagal menyalin kode', 'error'));
    }
    
    shareRoomCode() {
        if (navigator.share) {
            navigator.share({
                title: 'Camera Controller Room',
                text: `Gabung ke room kamera saya dengan kode: ${this.roomCode}`,
                url: window.location.href
            });
        } else {
            this.copyRoomCode();
        }
    }
    
    leaveRoom() {
        if (confirm('Apakah Anda yakin ingin menutup room? Semua client akan terputus.')) {
            this.socket.emit('leave-room', this.roomCode);
            window.location.href = '/';
        }
    }
    
    updateConnectionStatus(status) {
        const element = document.getElementById('globalStatus');
        if (!element) return;
        
        element.className = `connection-status ${status}`;
        element.innerHTML = `
            <i class="fas fa-circle"></i>
            <span>${status === 'connected' ? 'Terhubung' : 'Terputus'}</span>
        `;
        element.classList.remove('hidden');
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                ${this.getToastIcon(type)}
            </div>
            <div class="toast-content">
                <div class="toast-title">${this.getToastTitle(type)}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }
    
    getToastIcon(type) {
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>'
        };
        return icons[type] || icons.info;
    }
    
    getToastTitle(type) {
        const titles = {
            success: 'Berhasil',
            error: 'Error',
            warning: 'Peringatan',
            info: 'Informasi'
        };
        return titles[type] || 'Informasi';
    }
}

// Initialize host controller
const hostController = new HostController();
