class ClientController {
    constructor() {
        this.socket = io();
        this.roomCode = '';
        this.stream = null;
        this.isCameraActive = false;
        this.isFlashlightOn = false;
        this.zoomLevel = 1;
        this.captureInterval = null;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.init();
        this.bindEvents();
    }
    
    init() {
        this.showToast('Client siap', 'info');
        this.updateConnectionStatus('disconnected');
    }
    
    bindEvents() {
        // Room joining
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('roomCodeInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        // Permission handling
        document.getElementById('allowCameraBtn')?.addEventListener('click', () => this.requestCameraPermission());
        document.getElementById('grantPermissionBtn')?.addEventListener('click', () => this.requestCameraPermission());
        document.getElementById('denyPermissionBtn')?.addEventListener('click', () => this.hidePermissionModal());
        document.getElementById('cancelJoinBtn')?.addEventListener('click', () => this.cancelJoin());
        
        // Local controls
        document.getElementById('toggleLocalCameraBtn')?.addEventListener('click', () => this.toggleLocalCamera());
        document.getElementById('localFlashBtn')?.addEventListener('click', () => this.toggleLocalFlash());
        document.getElementById('localZoomSlider')?.addEventListener('input', (e) => this.handleLocalZoom(e));
        
        // QR Scanner
        document.getElementById('scanQRBtn')?.addEventListener('click', () => this.showQRScanner());
        document.getElementById('closeQRScannerBtn')?.addEventListener('click', () => this.hideQRScanner());
        
        // Room management
        document.getElementById('leaveRoomBtn')?.addEventListener('click', () => this.leaveRoom());
        
        // Socket events
        this.bindSocketEvents();
    }
    
    bindSocketEvents() {
        // Client joined room
        this.socket.on('client-joined', (data) => {
            this.roomCode = data.roomCode;
            this.showToast('Berhasil terhubung ke room!', 'success');
            this.updateConnectionStatus('connected');
            this.showPermissionSection();
        });
        
        // Camera control from host
        this.socket.on('camera-control', (data) => {
            this.handleCameraControl(data);
        });
        
        // Screenshot request
        this.socket.on('take-screenshot', () => {
            this.takeScreenshot();
        });
        
        // Room closed
        this.socket.on('room-closed', (data) => {
            this.showToast(data.message, 'info');
            this.stopCamera();
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        });
        
        // Error handling
        this.socket.on('error', (data) => {
            this.showToast(data.message, 'error');
        });
    }
    
    async joinRoom() {
        const roomCodeInput = document.getElementById('roomCodeInput');
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        
        if (roomCode.length !== 6) {
            this.showToast('Kode room harus 6 karakter', 'error');
            roomCodeInput.classList.add('error');
            return;
        }
        
        // Check if room exists
        try {
            const response = await fetch(`/api/check-room/${roomCode}`);
            const data = await response.json();
            
            if (!data.exists) {
                this.showToast('Room tidak ditemukan', 'error');
                roomCodeInput.classList.add('error');
                return;
            }
            
            this.roomCode = roomCode;
            roomCodeInput.classList.remove('error');
            
            // Show permission modal
            this.showPermissionModal();
            
        } catch (error) {
            this.showToast('Gagal memeriksa room', 'error');
        }
    }
    
    showPermissionModal() {
        document.getElementById('permissionModal').classList.remove('hidden');
    }
    
    hidePermissionModal() {
        document.getElementById('permissionModal').classList.add('hidden');
    }
    
    showPermissionSection() {
        document.getElementById('joinRoomSection').classList.add('hidden');
        document.getElementById('permissionSection').classList.remove('hidden');
    }
    
    showConnectedSection() {
        document.getElementById('permissionSection').classList.add('hidden');
        document.getElementById('connectedSection').classList.remove('hidden');
        document.getElementById('connectedRoomCode').textContent = this.roomCode;
    }
    
    async requestCameraPermission() {
        try {
            this.hidePermissionModal();
            
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment',
                    torch: false
                }
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.isCameraActive = true;
            
            // Show camera feed
            const cameraFeed = document.getElementById('cameraFeed');
            cameraFeed.srcObject = this.stream;
            
            // Join room
            this.socket.emit('client-join', this.roomCode);
            
            this.showConnectedSection();
            this.startStreaming();
            
            this.showToast('Kamera diaktifkan', 'success');
            this.updateCameraStatus(true);
            
        } catch (error) {
            this.showToast('Izin kamera ditolak atau terjadi error', 'error');
            console.error('Camera error:', error);
        }
    }
    
    handleCameraControl(data) {
        switch(data.action) {
            case 'camera':
                if (data.value === 'start' && !this.isCameraActive) {
                    this.startCamera();
                } else if (data.value === 'stop' && this.isCameraActive) {
                    this.stopCamera();
                }
                break;
                
            case 'flashlight':
                this.isFlashlightOn = data.value;
                this.updateFlashlight();
                break;
                
            case 'zoom':
                this.zoomLevel = data.value;
                this.updateZoom();
                break;
        }
    }
    
    startCamera() {
        if (!this.stream) {
            this.requestCameraPermission();
        } else {
            this.isCameraActive = true;
            this.updateCameraStatus(true);
            this.startStreaming();
        }
    }
    
    stopCamera() {
        this.isCameraActive = false;
        
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        
        this.updateCameraStatus(false);
        this.showToast('Kamera dimatikan oleh host', 'info');
    }
    
    toggleLocalCamera() {
        if (this.isCameraActive) {
            this.stopCamera();
        } else {
            this.startCamera();
        }
    }
    
    updateFlashlight() {
        const statusElement = document.getElementById('flashStatus');
        if (statusElement) {
            statusElement.innerHTML = `
                <i class="fas fa-lightbulb ${this.isFlashlightOn ? 'active' : ''}"></i>
                <span>${this.isFlashlightOn ? 'Nyala' : 'Mati'}</span>
            `;
            statusElement.className = `status ${this.isFlashlightOn ? 'success' : 'info'}`;
        }
        
        // Try to control torch if supported
        if (this.stream) {
            const videoTrack = this.stream.getVideoTracks()[0];
            if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
                try {
                    videoTrack.applyConstraints({
                        advanced: [{ torch: this.isFlashlightOn }]
                    });
                } catch (error) {
                    console.log('Torch not supported:', error);
                }
            }
        }
    }
    
    updateZoom() {
        const statusElement = document.getElementById('zoomStatus');
        if (statusElement) {
            statusElement.innerHTML = `
                <i class="fas fa-search"></i>
                <span>${this.zoomLevel.toFixed(1)}x</span>
            `;
        }
        
        // Update local slider for display
        const slider = document.getElementById('localZoomSlider');
        if (slider) {
            slider.value = this.zoomLevel;
        }
    }
    
    updateCameraStatus(active) {
        const statusElement = document.getElementById('cameraStatus');
        const button = document.getElementById('toggleLocalCameraBtn');
        const streamingStatus = document.getElementById('streamingStatus');
        
        if (statusElement) {
            statusElement.innerHTML = `
                <i class="fas fa-video${active ? '' : '-slash'}"></i>
                <span>${active ? 'Aktif' : 'Nonaktif'}</span>
            `;
            statusElement.className = `status ${active ? 'success' : 'warning'}`;
        }
        
        if (button) {
            button.innerHTML = `
                <i class="fas fa-video${active ? '-slash' : ''}"></i>
                <span>${active ? 'Matikan' : 'Hidupkan'} Kamera</span>
            `;
        }
        
        if (streamingStatus) {
            streamingStatus.textContent = active ? 'Streaming aktif' : 'Streaming berhenti';
        }
    }
    
    toggleLocalFlash() {
        if (!this.stream) return;
        
        this.isFlashlightOn = !this.isFlashlightOn;
        this.updateFlashlight();
        
        // Send to host if connected
        if (this.roomCode) {
            this.socket.emit('control-camera', {
                roomCode: this.roomCode,
                action: 'flashlight',
                value: this.isFlashlightOn
            });
        }
    }
    
    handleLocalZoom(event) {
        this.zoomLevel = parseFloat(event.target.value);
        this.updateZoom();
        
        // Send to host if connected
        if (this.roomCode) {
            this.socket.emit('control-camera', {
                roomCode: this.roomCode,
                action: 'zoom',
                value: this.zoomLevel
            });
        }
    }
    
    startStreaming() {
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
        }
        
        this.captureInterval = setInterval(() => {
            if (this.isCameraActive && this.stream) {
                const video = document.getElementById('cameraFeed');
                
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    this.canvas.width = video.videoWidth;
                    this.canvas.height = video.videoHeight;
                    
                    // Apply zoom
                    this.ctx.save();
                    const centerX = this.canvas.width / 2;
                    const centerY = this.canvas.height / 2;
                    
                    this.ctx.translate(centerX, centerY);
                    this.ctx.scale(this.zoomLevel, this.zoomLevel);
                    this.ctx.translate(-centerX, -centerY);
                    
                    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
                    this.ctx.restore();
                    
                    // Convert to base64
                    const imageData = this.canvas.toDataURL('image/jpeg', 0.7);
                    
                    // Send to host
                    this.socket.emit('stream-image', {
                        roomCode: this.roomCode,
                        imageData: imageData,
                        metadata: {
                            zoom: this.zoomLevel,
                            flashlight: this.isFlashlightOn,
                            timestamp: Date.now()
                        }
                    });
                }
            }
        }, 100); // 10 FPS
    }
    
    takeScreenshot() {
        if (!this.isCameraActive || !this.stream) {
            this.showToast('Kamera tidak aktif', 'warning');
            return;
        }
        
        const video = document.getElementById('cameraFeed');
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        tempCtx.drawImage(video, 0, 0);
        
        const imageData = tempCanvas.toDataURL('image/jpeg', 0.9);
        
        // Send to host
        this.socket.emit('screenshot-result', {
            roomCode: this.roomCode,
            imageData: imageData
        });
        
        // Also save locally
        this.saveScreenshotLocally(imageData);
        
        this.showToast('Screenshot diambil', 'success');
    }
    
    saveScreenshotLocally(imageData) {
        const link = document.createElement('a');
        link.href = imageData;
        link.download = `screenshot-${Date.now()}.jpg`;
        link.click();
    }
    
    cancelJoin() {
        document.getElementById('permissionSection').classList.add('hidden');
        document.getElementById('joinRoomSection').classList.remove('hidden');
    }
    
    leaveRoom() {
        if (confirm('Apakah Anda yakin ingin keluar dari room?')) {
            this.socket.emit('leave-room', this.roomCode);
            this.stopCamera();
            window.location.href = '/';
        }
    }
    
    showQRScanner() {
        document.getElementById('qrScannerModal').classList.remove('hidden');
        this.startQRScanner();
    }
    
    hideQRScanner() {
        document.getElementById('qrScannerModal').classList.add('hidden');
        this.stopQRScanner();
    }
    
    startQRScanner() {
        const container = document.getElementById('qrScannerContainer');
        container.innerHTML = '<video id="qrVideo" style="width: 100%; height: 100%;"></video>';
        
        const video = document.getElementById('qrVideo');
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                video.srcObject = stream;
                video.play();
                
                requestAnimationFrame(() => this.scanQRCode(video));
            })
            .catch(error => {
                this.showToast('Gagal mengakses kamera untuk scanner', 'error');
                console.error('QR Scanner error:', error);
            });
    }
    
    scanQRCode(video) {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                
                if (code) {
                    const roomCode = code.data.trim().toUpperCase();
                    if (roomCode.length === 6) {
                        document.getElementById('roomCodeInput').value = roomCode;
                        this.hideQRScanner();
                        this.showToast('Kode room berhasil discan!', 'success');
                        return;
                    }
                }
            } catch (error) {
                console.log('QR scan error:', error);
            }
        }
        
        requestAnimationFrame(() => this.scanQRCode(video));
    }
    
    stopQRScanner() {
        const video = document.getElementById('qrVideo');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
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

// Initialize client controller
const clientController = new ClientController();
