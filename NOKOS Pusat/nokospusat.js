// Konfigurasi Resmi Nokos Pusat
const API_BASE_URL = "https://nokospusat.com/api/v1";
let apiKey = localStorage.getItem('nokos_api_key') || ""; 

let activeOrders = []; 
let orderHistory = JSON.parse(localStorage.getItem('nokos_history')) || [];
let allServices = [];

let currentServiceId = localStorage.getItem('nokos_service_id') || "";
let currentServiceName = localStorage.getItem('nokos_service_name') || "";
let currentServicePrice = localStorage.getItem('nokos_service_price') || "0";

let pollingTimeout = null;
let timerWorker = null;
let isPolling = false;

function showToast(pesan, type = "success") { 
    const t = document.getElementById("toast"); 
    t.innerHTML = pesan; 
    t.style.backgroundColor = type === "error" ? "var(--danger-color)" : type === "warning" ? "var(--warning-color)" : "var(--success-color)";
    t.style.color = type === "warning" ? "#000" : (type === "error" ? "#fff" : "#000");
    t.classList.add("show"); 
    setTimeout(() => t.classList.remove("show"), 3000); 
}

function copyToClipboard(t) { 
    try {
        const ta = document.createElement("textarea"); ta.value = t; 
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); 
        document.body.removeChild(ta); showToast("Disalin: " + t); 
    } catch(e) { showToast("Gagal menyalin", "error"); }
}

// FUNGSI API CALL NOKOS PUSAT (Bearer Token & JSON)
async function apiCall(endpoint, method = 'GET', bodyParams = null) {
    if (!apiKey) {
        showToast("Mohon isi API Key Nokos Pusat di menu Pengaturan", "error");
        return { error: { message: "API Key Kosong" } };
    }
    
    let url = `${API_BASE_URL}${endpoint}`;
    let options = {
        method: method,
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    };
    
    if (method === 'POST' || method === 'DELETE') {
        options.headers['Content-Type'] = 'application/json';
        if (bodyParams) options.body = JSON.stringify(bodyParams);
    } else {
        options.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); 
    options.signal = controller.signal;

    try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        // Handle Error Standar Nokos
        if (!response.ok && data.error) {
            return { error: data.error };
        }
        return data; 
        
    } catch (err) { 
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') return { error: { message: "Koneksi lambat (Timeout)" } };
        return { error: { message: "Koneksi terputus: " + err.message } }; 
    }
}

window.onload = () => {
    if (currentServiceName) { 
        document.getElementById('btnServiceSelectText').innerHTML = currentServiceName; 
        document.getElementById('servicePriceBox').innerText = `Rp ${currentServicePrice}`;
    }
    startPolling();
    startTimerTick();
    initApp();
};

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { 
        startPolling(); 
        startTimerTick(); 
        fetchProfile(); 
        let svcText = document.getElementById('btnServiceSelectText').innerText;
        if (svcText.includes("Memuat") || svcText.includes("Error")) initApp(); 
    }
});

window.forceRefresh = async function() {
    const icon = document.getElementById('refreshIcon');
    if(icon) icon.classList.add('fa-spin');
    isPolling = false;
    if (pollingTimeout) clearTimeout(pollingTimeout);
    
    await fetchProfile(); 
    await pollActiveOrders(true);
    
    if(icon) icon.classList.remove('fa-spin');
    showToast("Disinkronkan!", "success");
}

function openSettingsModal() { 
    document.getElementById('settingsApiKey').value = apiKey; 
    document.getElementById('settingsModal').classList.remove('hidden'); 
}
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }

async function saveSettings() {
    let inputKey = document.getElementById('settingsApiKey').value.trim();
    if(!inputKey) { showToast("API Key tidak boleh kosong!", "error"); return; }
    apiKey = inputKey;
    localStorage.setItem('nokos_api_key', apiKey); 
    closeSettingsModal(); 
    showToast("API Key Tersimpan!", "success"); 
    initApp();
}

async function initApp() {
    if(!apiKey) return;
    await fetchProfile(); 
    await fetchServices();
}

// AMBIL SALDO NOKOS PUSAT
async function fetchProfile() {
    if(!apiKey) return;
    try {
        const res = await apiCall('/wallet', 'GET');
        if (res.data && res.data.balance !== undefined) {
            document.getElementById('balanceDisplay').innerText = `Rp ${res.data.balance}`;
            return true;
        } else if (res.error) {
            document.getElementById('balanceDisplay').innerText = "Auth Error";
            if(res.error.code === 'unauthorized') showToast("API Key Salah/Ditolak!", "error");
        }
    } catch (e) {
        document.getElementById('balanceDisplay').innerText = "Gagal";
    }
    return false;
}

function syncBalanceRobust() {
    fetchProfile(); 
    setTimeout(fetchProfile, 1500); 
}

// AMBIL KATALOG NOKOS PUSAT
async function fetchServices() {
    const btnText = document.getElementById('btnServiceSelectText');
    const priceBox = document.getElementById('servicePriceBox');
    const stockBox = document.getElementById('serviceStockBox');
    
    if (!currentServiceName) btnText.innerText = "Memuat Katalog...";
    
    try {
        const res = await apiCall('/services', 'GET');
        
        if (res.data && Array.isArray(res.data)) {
            allServices = res.data;
            
            // Set Default
            let target = null;
            if (currentServiceId) target = allServices.find(s => s.id === currentServiceId || s.slug === currentServiceId);
            if (!target) target = allServices.find(s => String(s.name).toLowerCase().includes("whatsapp indonesia"));
            if (!target && allServices.length > 0) target = allServices[0];
            
            if (target) {
                currentServiceId = target.slug || target.id;
                currentServiceName = target.name;
                currentServicePrice = target.price;
                
                btnText.innerText = currentServiceName;
                priceBox.innerText = `Rp ${currentServicePrice}`;
                stockBox.innerText = `Stok: ${target.stock}`;
                
                localStorage.setItem('nokos_service_id', currentServiceId);
                localStorage.setItem('nokos_service_name', currentServiceName);
                localStorage.setItem('nokos_service_price', currentServicePrice);
                
                document.getElementById('btnOrder').disabled = false;
            }
        } else if (res.error) {
            btnText.innerText = "Katalog Error";
        }
    } catch (e) {
        btnText.innerText = "Error Koneksi";
    }
}

window.openServiceModal = function() { 
    document.getElementById('serviceModal').classList.remove('hidden'); 
    document.getElementById('searchServiceInput').value = ''; 
    filterServices(); 
}
window.closeServiceModal = function() { document.getElementById('serviceModal').classList.add('hidden'); }
window.filterServices = function() {
    const q = document.getElementById('searchServiceInput').value.toLowerCase();
    const container = document.getElementById('serviceListContainer');
    container.innerHTML = '';
    
    const filtered = allServices.filter(s => String(s.name).toLowerCase().includes(q));
    
    if(filtered.length === 0) { container.innerHTML = '<div class="status-text-mini">Layanan tidak ditemukan.</div>'; return; }

    filtered.forEach(svc => {
        const isActive = (svc.slug === currentServiceId || svc.id === currentServiceId);
        const btn = document.createElement('div');
        
        // Desain Kartu Katalog Nokos
        btn.style = `width: 100%; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border: 2px solid ${isActive ? 'var(--primary-color)' : 'var(--border-color)'}; background: ${isActive ? 'rgba(0, 143, 81, 0.05)' : 'var(--bg-card)'}; cursor: pointer; margin-bottom: 8px;`;
        
        let logoHtml = svc.logo ? `<img src="${API_BASE_URL.replace('/api/v1', '')}${svc.logo}" style="width:24px; height:24px; border-radius:4px; margin-right:12px; background:#fff; padding:2px;">` : `<i class="fas fa-cube" style="margin-right:12px; font-size:18px;"></i>`;
        
        btn.innerHTML = `
            <div style="display:flex; align-items:center;">
                ${logoHtml}
                <div style="display:flex; flex-direction:column; text-align:left;">
                    <span style="color:var(--text-primary); font-size:13px;">${svc.name}</span>
                    <span style="color:var(--text-secondary); font-size:10px; font-weight:normal;">Stok: ${svc.stock}</span>
                </div>
            </div>
            <div style="color:var(--success-color); font-weight:900;">Rp ${svc.price}</div>
        `;
        
        btn.onclick = () => {
            currentServiceId = svc.slug || svc.id; 
            currentServiceName = svc.name; 
            currentServicePrice = svc.price;
            
            document.getElementById('btnServiceSelectText').innerText = currentServiceName;
            document.getElementById('serviceStockBox').innerText = `Stok: ${svc.stock}`;
            document.getElementById('servicePriceBox').innerText = `Rp ${currentServicePrice}`;
            
            localStorage.setItem('nokos_service_id', currentServiceId);
            localStorage.setItem('nokos_service_name', currentServiceName);
            localStorage.setItem('nokos_service_price', currentServicePrice);
            
            document.getElementById('btnOrder').disabled = false;
            closeServiceModal();
        };
        container.appendChild(btn);
    });
}

// BUAT PESANAN NOKOS PUSAT
window.createNewOrder = async function() {
    const btn = document.getElementById('btnOrder');
    btn.disabled = true; btn.innerText = "MEMPROSES...";
    
    document.getElementById('activeOrdersContainer').innerHTML = '<div class="status-text-mini">Menghubungi Nokos Pusat...</div>';
    
    // Payload Nokos Pusat
    const params = {
        service_id: currentServiceId,
        quoted_price: parseInt(currentServicePrice)
    };
    
    try {
        const res = await apiCall('/orders', 'POST', params);
        
        if (res.data && res.data.id) {
            showToast("Pesanan Berhasil Dibuat!", "success");
            
            // Simpan harga di cache agar tampil di kartu pesanan
            localStorage.setItem(`nokos_price_${res.data.id}`, currentServicePrice);
            
            syncBalanceRobust(); 
            await pollActiveOrders(true); 
        } else if (res.error) {
            showToast(res.error.message || "Gagal memesan nomor", "error");
            renderActiveOrders(); 
        }
    } catch(e) {
        showToast("Error Koneksi", "error");
        renderActiveOrders();
    } finally {
        if (pollingTimeout) clearTimeout(pollingTimeout);
        pollActiveOrders(); 
        btn.disabled = false; btn.innerText = "PESAN NOMOR BARU";
    }
}

// RENDER KARTU PESANAN
function renderActiveOrders() {
    const container = document.getElementById('activeOrdersContainer');
    if (!container) return;
    
    if (!Array.isArray(activeOrders) || activeOrders.length === 0) { 
        container.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; 
        return; 
    }
    
    container.innerHTML = "";
    
    [...activeOrders].reverse().forEach(order => {
        try {
            if (!order || !order.id) return; 
            
            // NOKOS: Gunakan expires_at asli dari server untuk timer
            const now = Date.now();
            const expTime = new Date(order.expires_at).getTime();
            const left = expTime - now; 
            
            let m = Math.floor(Math.max(0, left) / 60000); 
            let s = Math.floor((Math.max(0, left) % 60000) / 1000);
            let timeStr = left > 0 ? `${m}:${s<10?'0':''}${s}` : 'Habis';
            
            // Status Nokos
            const isCompleted = order.status === 'completed';
            
            let actionBtnHtml = "";
            
            if (!isCompleted) {
                // Tombol Batal Instan
                actionBtnHtml = `<button class="btn-danger" onclick="cancelOrder('${order.id}')" style="width:100%;">BATAL</button>`;
            } else {
                // NOKOS: Jika Selesai, hapus dari memori lokal (karena tidak ada endpoint finish)
                actionBtnHtml = `<button class="btn-success" onclick="closeOrder('${order.id}')" style="width:100%;">TUTUP / SELESAI</button>`;
            }

            let otpHtml = "";
            if (isCompleted && order.otp) {
                // EKSTRAKSI MURNI: Ambil code jika ada, jika tidak ekstrak paksa
                let rawCode = order.otp.code || order.otp.message || "";
                let extracted = String(rawCode).match(/\b\d{4,8}\b/);
                let displayCode = extracted ? extracted[0] : String(rawCode); 
                
                otpHtml = `
                    <div class="otp-title">SMS DITERIMA</div>
                    <div class="otp-code-item">
                        <span>${displayCode}</span>
                        <button class="btn-copy" onclick="copyToClipboard('${displayCode}')"><i class="fas fa-copy"></i></button>
                    </div>
                `;
            } else {
                otpHtml = `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text" style="font-size:11px; font-weight:800; color:var(--text-secondary); margin-top:8px;">MENUNGGU SMS MASUK...</div>`;
            }
            
            let srvName = order.service && order.service.name ? order.service.name : "Layanan";
            let phoneNumber = order.number || "Memproses...";
            let opName = "AUTO"; // Nokos biasanya otomatis memilihkan yang terbaik
            
            // Lencana Harga
            let savedPrice = localStorage.getItem(`nokos_price_${order.id}`) || order.price || "";
            let priceBadge = savedPrice ? `<span style="font-size:10px; font-weight:900; background:rgba(0, 143, 81, 0.15); color:var(--success-color); border:1px dashed var(--success-color); padding:2px 6px; border-radius:6px; margin-left:6px; display:inline-block; transform:translateY(-1px);">Rp ${savedPrice}</span>` : "";
            
            const card = document.createElement("div"); 
            card.className = "order-card"; 
            card.id = `order-card-${order.id}`;
            card.innerHTML = `
                <div class="order-header">
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                        <div class="order-id-label">#${String(order.id).substring(0,8).toUpperCase()} (${String(srvName).toUpperCase()})</div>
                        ${priceBadge}
                    </div>
                    <span class="timer" id="timer-${order.id}" style="${left <= 60000 ? 'color:var(--danger-color);' : ''}">${timeStr}</span>
                </div>
                <div class="phone-row">
                    <span class="phone-number">${formatPhoneNumber(phoneNumber)}</span>
                    <button class="btn-copy" onclick="copyToClipboard('${phoneNumber}')"><i class="fas fa-copy"></i></button>
                </div>
                <div class="otp-display ${isCompleted ? 'success-glow' : ''}">${otpHtml}</div>
                
                <div class="action-buttons-grid">
                    ${actionBtnHtml}
                </div>
            `;
            container.appendChild(card);
        } catch (err) {
            console.error("Gagal menggambar kotak", err);
        }
    });
}

// POLLING NOKOS (GET /api/v1/orders)
async function pollActiveOrders(isManual = false) {
    if (isPolling && !isManual) return;
    if (!apiKey) return;
    isPolling = true;
    
    try {
        // Ambil 20 order terakhir
        const res = await apiCall('/orders?limit=20', 'GET');
        
        if (res.data && Array.isArray(res.data)) {
            let serverOrders = res.data;
            const now = Date.now();
            let isChanged = false;

            // Saring hanya pesanan yang masih pending atau awaiting_otp, ATAU yang ada di memori kita tapi baru saja completed
            let newActiveOrders = [];
            
            serverOrders.forEach(so => {
                let existingIdx = activeOrders.findIndex(lo => lo.id === so.id);
                
                if (so.status === 'pending' || so.status === 'awaiting_otp') {
                    newActiveOrders.push(so);
                } else if (so.status === 'completed' && existingIdx !== -1) {
                    // Pesanan baru saja selesai! Tetap masukkan ke layar agar pengguna bisa baca OTP-nya
                    newActiveOrders.push(so);
                    
                    // Mainkan suara/getaran jika OTP baru masuk
                    let oldStatus = activeOrders[existingIdx].status;
                    if (oldStatus !== 'completed') {
                        isChanged = true;
                        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
                    }
                } else if ((so.status === 'cancelled' || so.status === 'expired') && existingIdx !== -1) {
                    // Pesanan mati di server, hapus otomatis dari layar kita
                    isChanged = true;
                    localStorage.removeItem(`nokos_price_${so.id}`);
                }
            });
            
            // Pertahankan order di memori jika tidak dikembalikan oleh server (misal karena limit pagination) namun waktunya masih aktif
            activeOrders.forEach(lo => {
                if (!newActiveOrders.find(so => so.id === lo.id)) {
                    let expTime = new Date(lo.expires_at).getTime();
                    if (expTime > now) {
                        newActiveOrders.push(lo);
                    }
                }
            });

            // Urutkan berdasarkan waktu
            newActiveOrders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            
            activeOrders = newActiveOrders;
            
            if (isChanged) syncBalanceRobust(); 
            renderActiveOrders();
        }
    } catch (e) {
        console.error("Polling Terhambat:", e);
    } finally {
        isPolling = false;
        if (pollingTimeout) clearTimeout(pollingTimeout);
        let nextDelay = activeOrders.length > 0 ? 3000 : 8000;
        pollingTimeout = setTimeout(pollActiveOrders, nextDelay);
    }
}

function startPolling() {
    if (pollingTimeout) clearTimeout(pollingTimeout);
    pollActiveOrders();
}

window.cancelOrder = async function(orderId) {
    const card = document.getElementById(`order-card-${orderId}`);
    if(card) card.style.opacity = '0.5';
    
    // DELETE /api/v1/orders/:id
    const res = await apiCall(`/orders/${orderId}`, 'DELETE');
    
    // Nokos membalas dengan data pesanan yang dibatalkan
    if (res.data && res.data.id) {
        showToast("Pesanan Dibatalkan");
        saveToHistory(orderId, "BATAL");
        
        activeOrders = activeOrders.filter(o => o.id !== orderId); 
        localStorage.removeItem(`nokos_price_${orderId}`);
        
        renderActiveOrders();
        syncBalanceRobust(); // Nokos refund otomatis
    } else {
        showToast(res.error ? res.error.message : "Gagal membatalkan", "error");
        if(card) card.style.opacity = '1';
    }
}

// NOKOS TIDAK PUNYA ENDPOINT FINISH. Tombol ini hanya menutup layar dan simpan riwayat.
window.closeOrder = function(orderId) {
    const order = activeOrders.find(o => o.id === orderId);
    if(order) saveToHistory(orderId, "SELESAI");
    
    activeOrders = activeOrders.filter(o => o.id !== orderId);
    localStorage.removeItem(`nokos_price_${orderId}`);
    renderActiveOrders();
}

function startTimerTick() {
    const runTick = () => {
        let needsRender = false;
        const now = Date.now();
        
        for (let i = activeOrders.length - 1; i >= 0; i--) {
            let o = activeOrders[i];
            
            if (!o.expires_at) continue;
            const expTime = new Date(o.expires_at).getTime();
            const left = expTime - now; 
            
            if (left <= 0 && o.status !== 'completed') {
                localStorage.removeItem(`nokos_price_${o.id}`);
                activeOrders.splice(i, 1);
                needsRender = true;
                syncBalanceRobust(); // Waktu habis, saldo harusnya kembali
                continue;
            }
            
            const timerEl = document.getElementById(`timer-${o.id}`);
            if (timerEl && o.status !== 'completed') {
                let m = Math.floor(Math.max(0, left) / 60000); 
                let s = Math.floor((Math.max(0, left) % 60000) / 1000);
                timerEl.innerText = left > 0 ? `${m}:${s<10?'0':''}${s}` : 'Habis';
                if (left <= 60000) timerEl.style.color = "var(--danger-color)";
                else timerEl.style.color = "var(--text-primary)";
            }
        }
        if (needsRender) renderActiveOrders();
    };
    
    runTick(); 
    
    if (timerWorker) timerWorker.terminate();
    const workerCode = `
        let interval;
        self.onmessage = function(e) {
            if (e.data === 'start') { interval = setInterval(() => { postMessage('tick'); }, 1000); }
            else if (e.data === 'stop') { clearInterval(interval); }
        };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    timerWorker = new Worker(URL.createObjectURL(blob));
    timerWorker.onmessage = function() { runTick(); };
    timerWorker.postMessage('start');
}

function saveToHistory(orderId, finalStatus) { 
    const order = activeOrders.find(o => o.id === orderId);
    if (!order) return; 
    
    let lastOtp = "-";
    if (order.otp && order.otp.code) {
        lastOtp = order.otp.code;
    } else if (order.otp && order.otp.message) {
        let extracted = String(order.otp.message).match(/\b\d{4,8}\b/);
        lastOtp = extracted ? extracted[0] : "-";
    }
    
    let srvName = order.service && order.service.name ? order.service.name : "Layanan";
    let ph = order.number || "";
    
    const historyItem = { id: order.id, phone: ph, serviceName: srvName, otp: lastOtp, status: finalStatus, date: Date.now() }; 
    orderHistory.unshift(historyItem); 
    if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem('nokos_history', JSON.stringify(orderHistory)); 
    renderHistory(); 
}

window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); renderHistory(); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Bersihkan riwayat?")) { orderHistory = []; localStorage.removeItem('nokos_history'); renderHistory(); } }

function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    if (orderHistory.length === 0) { list.innerHTML = '<div class="status-text-mini">Belum ada riwayat lokal.</div>'; return; } 
    list.innerHTML = "";
    orderHistory.forEach(item => {
        const card = document.createElement('div'); 
        card.style = "background: var(--bg-card); padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 11px;";
        let statusColor = item.status === "SELESAI" ? "var(--success-color)" : "var(--danger-color)";
        const dt = new Date(item.date); 
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: var(--text-primary); font-size: 13px; letter-spacing: 1px;">${formatPhoneNumber(item.phone)} <span style="font-size:9px; color:var(--text-secondary);">(${item.serviceName})</span></strong>
                <span style="color: ${statusColor}; font-weight: 900;">${item.status}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 10px; margin-bottom: ${item.status === 'SELESAI' ? '6px' : '0'};">
                <span>ID: #${String(item.id).substring(0,8)}</span><span>${timeStr}</span>
            </div>
            ${item.status === 'SELESAI' ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px;">${item.otp}</div>` : ''}
        `;
        list.appendChild(card);
    });
}
