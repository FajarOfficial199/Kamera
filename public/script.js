// Host script
if (window.location.pathname === '/host' || window.location.pathname === '/host.html') {
    document.addEventListener('DOMContentLoaded', function() {
        const socket = io();
        const createRoomBtn = document.getElementById('createRoomBtn');
        const roomCodeDisplay = document.getElementById('roomCodeDisplay');
        const connectionStatus = document.getElementById('connectionStatus');
        const clientsContainer = document.getElementById('clientsContainer');
        const controlsSection = document.getElementById('controlsSection');
        const videoFeed = document.getElementById('videoFeed');
        const toggleCameraBtn = document.getElementById('toggleCameraBtn');
        const flashlightBtn = document.getElementById('flashlightBtn');
        const zoomSlider = document.getElementById('zoomSlider');
        const zoomValue = document.getElementById('zoomValue');
        
        let roomCode = '';
        let connectedClients = new Set();
        let currentClientId = null;
        let cameraActive = false;
        let flashlightOn = false;
        
        // Buat room baru
        createRoomBtn.addEventListener('click', async function() {
            try {
                const response = await fetch('/create-room', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                roomCode = data.roomCode;
                
                // Tampilkan kode room
                roomCodeDisplay.textContent = roomCode;
                document.getElementById('createRoomSection').classList.add('hidden');
                document.getElementById('roomCreatedSection').classList.remove('hidden');
                
                // Gabung ke room sebagai host
                socket.emit('host-join', roomCode);
                
                // Update status
                connectionStatus.textContent = 'Menunggu koneksi client...';
                connectionStatus.className = 'status disconnected';
                
            } catch (error) {
                console.error('Error creating room:', error);
                alert('Gagal membuat room. Silakan coba lagi.');
            }
        });
        
        // Konfirmasi host telah bergabung
        socket.on('host-joined', function(code) {
            console.log('Host joined room:', code);
            connectionStatus.textContent = 'Host siap. Menunggu client...';
        });
        
        // Client terhubung
        socket.on('client-connected', function(clientId) {
            console.log('Client connected:', clientId);
            connectedClients.add(clientId);
            currentClientId = clientId;
            
            // Update UI
            connectionStatus.textContent = `Client terhubung: ${clientId.substring(0, 8)}...`;
            connectionStatus.className = 'status connected';
            controlsSection.classList.remove('hidden');
            
            // Tampilkan daftar client
            updateClientsList();
        });
        
        // Client terputus
        socket.on('client-disconnected', function(clientId) {
            console.log('Client disconnected:', clientId);
            connectedClients.delete(clientId);
            
            if (connectedClients.size === 0) {
                currentClientId = null;
                connectionStatus.textContent = 'Menunggu koneksi client...';
                connectionStatus.className = 'status disconnected';
                controlsSection.classList.add('hidden');
                videoFeed.src = '';
            }
            
            updateClientsList();
        });
        
        // Menerima stream gambar dari client
        socket.on('image-stream', function(data) {
            if (data.clientId === currentClientId) {
                videoFeed.src = data.imageData;
            }
        });
        
        // Room ditutup
        socket.on('room-closed', function() {
            alert('Room telah ditutup');
            window.location.href = '/';
        });
        
        // Error handling
        socket.on('error', function(message) {
            alert(`Error: ${message}`);
        });
        
        // Update daftar client
        function updateClientsList() {
            clientsContainer.innerHTML = '';
            connectedClients.forEach(clientId => {
                const clientDiv = document.createElement('div');
                clientDiv.className = 'client-item';
                clientDiv.innerHTML = `
                    <span>Client: ${clientId.substring(0, 8)}...</span>
                    <span class="${clientId === currentClientId ? 'connected' : ''}">
                        ${clientId === currentClientId ? 'Aktif' : 'Tidak aktif'}
                    </span>
                `;
                clientsContainer.appendChild(clientDiv);
            });
        }
        
        // Kontrol kamera
        toggleCameraBtn.addEventListener('click', function() {
            cameraActive = !cameraActive;
            const action = cameraActive ? 'start' : 'stop';
            
            socket.emit('control-camera', {
                roomCode: roomCode,
                action: 'camera',
                value: action
            });
            
            toggleCameraBtn.innerHTML = cameraActive ? 
                '<i class="fas fa-video-slash"></i> Matikan Kamera' : 
                '<i class="fas fa-video"></i> Hidupkan Kamera';
            
            toggleCameraBtn.classList.toggle('active', cameraActive);
        });
        
        // Kontrol senter
        flashlightBtn.addEventListener('click', function() {
            flashlightOn = !flashlightOn;
            
            socket.emit('control-camera', {
                roomCode: roomCode,
                action: 'flashlight',
                value: flashlightOn
            });
            
            flashlightBtn.innerHTML = flashlightOn ? 
                '<i class="fas fa-lightbulb"></i> Senter: NYALA' : 
                '<i class="fas fa-lightbulb"></i> Senter: MATI';
            
            flashlightBtn.classList.toggle('active', flashlightOn);
        });
        
        // Kontrol zoom
        zoomSlider.addEventListener('input', function() {
            const zoomLevel = parseFloat(this.value);
            zoomValue.textContent = `${zoomLevel.toFixed(1)}x`;
            
            socket.emit('control-camera', {
                roomCode: roomCode,
                action: 'zoom',
                value: zoomLevel
            });
        });
    });
}

// Client script
if (window.location.pathname === '/client' || window.location.pathname === '/client.html') {
    document.addEventListener('DOMContentLoaded', function() {
        const socket = io();
        const joinRoomBtn = document.getElementById('joinRoomBtn');
        const roomCodeInput = document.getElementById('roomCodeInput');
        const connectedRoomCode = document.getElementById('connectedRoomCode');
        const clientStatus = document.getElementById('clientStatus');
        const cameraFeed = document.getElementById('cameraFeed');
        const clientZoomSlider = document.getElementById('clientZoomSlider');
        const clientZoomValue = document.getElementById('clientZoomValue');
        const clientToggleCameraBtn = document.getElementById('clientToggleCameraBtn');
        
        let roomCode = '';
        let stream = null;
        let cameraActive = false;
        let zoomLevel = 1;
        let flashlightOn = false;
        let captureInterval = null;
        
        // Gabung ke room
        joinRoomBtn.addEventListener('click', function() {
            roomCode = roomCodeInput.value.trim().toUpperCase();
            
            if (roomCode.length !== 6) {
                alert('Kode room harus 6 karakter');
                return;
            }
            
            // Gabung ke room sebagai client
            socket.emit('client-join', roomCode);
            
            // Update UI
            document.getElementById('joinRoomSection').classList.add('hidden');
            document.getElementById('clientConnectedSection').classList.remove('hidden');
            connectedRoomCode.textContent = roomCode;
        });
        
        // Konfirmasi client telah bergabung
        socket.on('client-joined', function(code) {
            console.log('Client joined room:', code);
            clientStatus.textContent = 'Terhubung ke room. Menunggu perintah host...';
            
            // Aktifkan kamera secara default
            startCamera();
        });
        
        // Menerima perintah kontrol dari host
        socket.on('camera-control', function(data) {
            console.log('Received control:', data);
            
            switch(data.action) {
                case 'camera':
                    if (data.value === 'start' && !cameraActive) {
                        startCamera();
                    } else if (data.value === 'stop' && cameraActive) {
                        stopCamera();
                    }
                    break;
                    
                case 'flashlight':
                    flashlightOn = data.value;
                    updateFlashlight();
                    break;
                    
                case 'zoom':
                    zoomLevel = data.value;
                    clientZoomSlider.value = zoomLevel;
                    clientZoomValue.textContent = `${zoomLevel.toFixed(1)}x`;
                    applyZoom();
                    break;
            }
        });
        
        // Room ditutup
        socket.on('room-closed', function() {
            alert('Host telah menutup room');
            stopCamera();
            window.location.href = '/';
        });
        
        // Error handling
        socket.on('error', function(message) {
            alert(`Error: ${message}`);
        });
        
        // Mulai kamera
        async function startCamera() {
            try {
                // Coba dengan flash/light jika tersedia
                const constraints = {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'environment'
                    }
                };
                
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                cameraFeed.srcObject = stream;
                cameraActive = true;
                
                // Mulai mengirim gambar ke host
                startStreaming();
                
                // Update UI
                clientToggleCameraBtn.innerHTML = '<i class="fas fa-video-slash"></i> Kamera Aktif';
                clientToggleCameraBtn.classList.add('active');
                
                clientStatus.textContent = 'Kamera aktif. Host dapat mengontrol kamera Anda.';
                
            } catch (error) {
                console.error('Error accessing camera:', error);
                alert('Tidak dapat mengakses kamera. Pastikan Anda memberikan izin.');
            }
        }
        
        // Hentikan kamera
        function stopCamera() {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            
            if (captureInterval) {
                clearInterval(captureInterval);
                captureInterval = null;
            }
            
            cameraActive = false;
            cameraFeed.srcObject = null;
            
            // Update UI
            clientToggleCameraBtn.innerHTML = '<i class="fas fa-video"></i> Kamera Nonaktif';
            clientToggleCameraBtn.classList.remove('active');
            
            clientStatus.textContent = 'Kamera dimatikan oleh host.';
        }
        
        // Mulai streaming gambar ke host
        function startStreaming() {
            if (captureInterval) {
                clearInterval(captureInterval);
            }
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            captureInterval = setInterval(() => {
                if (cameraActive && stream) {
                    canvas.width = cameraFeed.videoWidth;
                    canvas.height = cameraFeed.videoHeight;
                    
                    // Terapkan zoom
                    ctx.save();
                    const centerX = canvas.width / 2;
                    const centerY = canvas.height / 2;
                    
                    ctx.translate(centerX, centerY);
                    ctx.scale(zoomLevel, zoomLevel);
                    ctx.translate(-centerX, -centerY);
                    
                    ctx.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);
                    ctx.restore();
                    
                    // Konversi ke base64
                    const imageData = canvas.toDataURL('image/jpeg', 0.5);
                    
                    // Kirim ke host
                    socket.emit('stream-image', {
                        roomCode: roomCode,
                        imageData: imageData
                    });
                }
            }, 100); // 10 fps
        }
        
        // Terapkan zoom
        function applyZoom() {
            // Zoom diterapkan saat menggambar di canvas
            // Tidak perlu mengubah video stream langsung
        }
        
        // Update flashlight/senter
        function updateFlashlight() {
            if (!stream) return;
            
            const videoTrack = stream.getVideoTracks()[0];
            
            if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
                try {
                    videoTrack.applyConstraints({
                        advanced: [{ torch: flashlightOn }]
                    }).catch(() => {
                        // Fallback jika torch tidak didukung
                        console.log('Torch not supported');
                    });
                } catch (error) {
                    console.log('Flashlight control not available:', error);
                }
            }
        }
        
        // Toggle kamera lokal (untuk testing)
        clientToggleCameraBtn.addEventListener('click', function() {
            if (cameraActive) {
                stopCamera();
            } else {
                startCamera();
            }
        });
    });
}
