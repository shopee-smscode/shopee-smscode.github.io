const API_BASE_URL = "https://adaotp.com/api/v1";
let apiKey = localStorage.getItem('adaotp_api_key') || ""; 

let activeOrders = []; // Disinkronkan langsung dari server ADAOTP
let orderHistory = JSON.parse(localStorage.getItem('adaotp_history')) || [];
let allServices = [];
let allCountries = [];

let currentServiceId = localStorage.getItem('adaotp_service_id') || "";
let currentServiceName = localStorage.getItem('adaotp_service_name') || "";
let currentCountryId = localStorage.getItem('adaotp_country_id') || "";

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

// ================= API CALLER ADAOTP =================
async function apiCall(endpoint, method = 'GET', urlParams = "") {
    if (!apiKey) return { success: false, message: "API Key Kosong" };
    
    // Format URL: https://adaotp.com/api/v1/endpoint?apikey=...&...
    let url = `${API_BASE_URL}${endpoint}?apikey=${apiKey}${urlParams ? '&'+urlParams : ''}`;
    let options = { method: method };
    
    if (method === 'POST' || method === 'DELETE') {
        options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    }

    try {
        const response = await fetch(url, options);
        return await response.json(); 
    } catch (err) { 
        return { success: false, message: "Koneksi terputus: " + err.message }; 
    }
}

// ================= INIT & SETTINGS =================
window.onload = () => {
    if (currentServiceName) { document.getElementById('btnServiceSelectText').innerHTML = currentServiceName; }
    if (!apiKey) { openSettingsModal(); } else { initApp(); }
};

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { startPolling(); startTimerTick(); }
});
window.addEventListener('online', () => { showToast("🌐 Online", "success"); startPolling(); });

function openSettingsModal() { 
    document.getElementById('settingsApiKey').value = apiKey; 
    document.getElementById('settingsModal').classList.remove('hidden'); 
}
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }
async function saveSettings() {
    apiKey = document.getElementById('settingsApiKey').value.trim();
    localStorage.setItem('adaotp_api_key', apiKey); 
    closeSettingsModal(); showToast("API Key Disimpan!"); initApp();
}

async function initApp() {
    await fetchProfile();
    await fetchServices();
    startPolling();
    startTimerTick();
}

async function fetchProfile() {
    const res = await apiCall('/profile', 'GET');
    if (res.success && res.data) {
        document.getElementById('currentAccountEmail').innerText = res.data.user.email;
        document.getElementById('balanceDisplay').innerText = res.data.user.balance;
    } else {
        document.getElementById('balanceDisplay').innerText = "Error API";
        if (res.message) showToast(res.message, "error");
    }
}

// ================= LAYANAN & NEGARA =================
async function fetchServices() {
    document.getElementById('btnServiceSelectText').innerText = "Memuat...";
    const res = await apiCall('/services', 'GET');
    if (res.success && res.data) {
        allServices = res.data.sort((a, b) => String(a.text).localeCompare(String(b.text)));
        
        let target = allServices.find(s => s.id == currentServiceId) || allServices.find(s => String(s.text).toLowerCase().includes("whatsapp")) || allServices[0];
        if (target) {
            currentServiceId = target.id;
            currentServiceName = target.text;
        }
        updateServiceUI();
        await fetchCountries();
    } else {
        document.getElementById('btnServiceSelectText').innerText = "Gagal Memuat";
    }
}

function updateServiceUI() {
    document.getElementById('btnServiceSelectText').innerHTML = currentServiceName;
    localStorage.setItem('adaotp_service_id', currentServiceId);
    localStorage.setItem('adaotp_service_name', currentServiceName);
}

// Menarik negara spesifik berdasarkan layanan yang dipilih
async function fetchCountries() {
    const list = document.getElementById('countryList');
    list.innerHTML = '<div class="status-text-mini" style="grid-column: span 3;">Memuat negara...</div>';
    document.getElementById('btnOrder').disabled = true;

    if (!currentServiceId) return;
    
    // API GET /services/{id}/countries
    const res = await apiCall(`/services/${currentServiceId}/countries`, 'GET');
    if (res.success && res.data) {
        allCountries = res.data;
        list.innerHTML = '';
        
        // Cek apakah memori negara masih ada di layanan ini
        let validCountry = allCountries.find(c => c.id == currentCountryId);
        if (!validCountry && allCountries.length > 0) currentCountryId = allCountries[0].id;
        
        allCountries.forEach(c => {
            const card = document.createElement("div"); 
            card.className = "product-card"; 
            if (currentCountryId == c.id) card.classList.add('selected');
            
            // Render nama negara & harga (jika disediakan API, jika tidak tampilkan namanya saja)
            let cName = c.name || `ID: ${c.id}`;
            let priceText = c.price ? `<div style="color:var(--success-color); font-size:10px;">Rp ${c.price}</div>` : '';
            
            card.innerHTML = `<div class="product-info"><h4>${cName}</h4>${priceText}</div>`;
            card.onclick = () => { 
                document.querySelectorAll('.product-card').forEach(el => el.classList.remove('selected')); 
                card.classList.add('selected'); 
                currentCountryId = c.id; 
                localStorage.setItem('adaotp_country_id', currentCountryId);
            };
            list.appendChild(card);
        });
        document.getElementById('btnOrder').disabled = false;
    } else {
        list.innerHTML = '<div class="status-text-mini" style="grid-column:span 3; color:var(--danger-color);">Stok Kosong / Gagal</div>';
    }
}

// Modal Layanan (Bisa pakai logo)
window.openServiceModal = function() { document.getElementById('serviceModal').classList.remove('hidden'); document.getElementById('searchServiceInput').value = ''; filterServices(); }
window.closeServiceModal = function() { document.getElementById('serviceModal').classList.add('hidden'); }
window.filterServices = function() {
    const q = document.getElementById('searchServiceInput').value.toLowerCase();
    const container = document.getElementById('serviceListContainer');
    container.innerHTML = '';
    const filtered = allServices.filter(s => String(s.text).toLowerCase().includes(q));
    
    if(filtered.length === 0) { container.innerHTML = '<div class="status-text-mini">Tidak ditemukan.</div>'; return; }

    filtered.forEach(svc => {
        const isActive = (svc.id == currentServiceId);
        const btn = document.createElement('div');
        btn.style = `width: 100%; padding: 10px; border-radius: 10px; font-size: 13px; font-weight: bold; display: flex; align-items: center; border: 2px solid ${isActive ? 'var(--primary-color)' : 'var(--border-color)'}; background: ${isActive ? 'var(--bg-body)' : 'var(--bg-card)'}; color: ${isActive ? 'var(--primary-color)' : 'var(--text-primary)'}; cursor: pointer; margin-bottom: 6px;`;
        
        let iconHtml = svc.icon ? `<img src="${svc.icon}" style="width:24px; height:24px; border-radius:6px; margin-right:10px;">` : `<i class="fas fa-cube" style="margin-right:10px;"></i>`;
        
        btn.innerHTML = `${iconHtml} <span>${svc.text}</span>`;
        btn.onclick = () => {
            currentServiceId = svc.id; 
            currentServiceName = svc.text; 
            updateServiceUI(); 
            closeServiceModal();
            fetchCountries(); // Refresh negara setiap pindah layanan
        };
        container.appendChild(btn);
    });
}

// ================= PESAN NOMOR BARU =================
window.createNewOrder = async function() {
    const btn = document.getElementById('btnOrder');
    btn.disabled = true; btn.innerText = "MEMPROSES...";
    
    // API POST /orders
    const params = `country=${currentCountryId}&service_id=${currentServiceId}`;
    const res = await apiCall('/orders', 'POST', params);
    
    if (res.success) {
        showToast("Nomor Berhasil Dipesan!");
        fetchProfile(); // Update saldo
        pollActiveOrders(); // Langsung paksa sinkronisasi dengan server
    } else {
        showToast(res.message || "Gagal memesan nomor", "error");
    }
    
    btn.disabled = false; btn.innerText = "PESAN NOMOR";
}

// ================= RENDER PESANAN AKTIF =================
function renderActiveOrders() {
    const container = document.getElementById('activeOrdersContainer');
    if (!container) return;
    
    if (activeOrders.length === 0) { 
        container.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; 
        return; 
    }
    
    container.innerHTML = "";
    
    // Balik urutan agar yang terbaru di atas
    [...activeOrders].reverse().forEach(order => {
        const now = Date.now();
        // Server ADAOTP memberikan created_at, kita ubah ke timestamp JS
        // Jika API memberi format string "2025-09-30T00...", kita parse. 
        // Jika belum ada/tidak jelas, kita pakai fallback Date.now
        let createdTime = order.created_at ? new Date(order.created_at).getTime() : now; 
        
        const card = document.createElement("div"); 
        card.className = "order-card"; 
        card.id = `order-card-${order.id}`;
        
        // Mengecek apakah sudah bisa dibatalkan (Cancel rule: > 1 min)
        let canCancel = (now - createdTime) >= 60000;
        let cancelBtnHtml = "";
        
        // Mengecek multi-OTP SMS
        // Asumsi API mengembalikan sms sebagai array atau string jika ada (misal: order.sms atau order.received_sms)
        let smsArray = order.sms || order.messages || []; 
        if (typeof smsArray === 'string') smsArray = [smsArray]; // Antisipasi jika formatnya beda
        
        const hasSms = smsArray.length > 0;
        
        // TIMER DISPLAY (Maksimal 20 Menit = 1200000 ms)
        const left = (createdTime + 1200000) - now; 
        let m = Math.floor(Math.max(0, left) / 60000); 
        let s = Math.floor((Math.max(0, left) % 60000) / 1000);
        let timeStr = left > 0 ? `${m}:${s<10?'0':''}${s}` : 'Habis';
        
        // Tombol Batal Pintar
        if (!hasSms) {
            if (canCancel) {
                cancelBtnHtml = `<button class="btn-danger" onclick="cancelOrder(${order.id})"><i class="fas fa-times"></i> Batal</button>`;
            } else {
                let waitSecs = 60 - Math.floor((now - createdTime) / 1000);
                cancelBtnHtml = `<button class="btn-danger" disabled><i class="fas fa-lock"></i> Batal (${Math.max(0, waitSecs)}s)</button>`;
            }
        } else {
            // Sesuai aturan: tidak bisa cancel jika sudah ada SMS
            cancelBtnHtml = `<button class="btn-danger" disabled><i class="fas fa-ban"></i> Batal</button>`;
        }

        // Tampilan Multi SMS Berjejer
        let otpHtml = "";
        if (hasSms) {
            let stackHtml = smsArray.map((msg, i) => {
                // Ekstrak angka saja jika memungkinkan
                let code = msg;
                let extracted = String(msg).match(/\b\d{4,8}\b/);
                if (extracted) code = extracted[0];
                return `
                <div class="otp-code-item">
                    <span>${code}</span>
                    <button class="btn-copy" onclick="copyToClipboard('${code}')"><i class="fas fa-copy"></i></button>
                </div>`;
            }).join("");
            
            otpHtml = `
                <div class="otp-title">SMS DITERIMA (${smsArray.length})</div>
                ${stackHtml}
                <div class="waiting-animation" style="margin-top:10px;"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div></div>
                <div class="waiting-text" style="font-size:9px; font-weight:800; color:var(--text-secondary); text-align:center;">MENUNGGU SMS BERIKUTNYA...</div>
            `;
        } else {
            otpHtml = `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text" style="font-size:11px; font-weight:800; color:var(--text-secondary); margin-top:8px;">MENUNGGU SMS...</div>`;
        }
        
        card.innerHTML = `
            <div class="order-header">
                <div>
                    <div class="order-id-label">#${order.id} (${order.service || currentServiceName})</div>
                </div>
                <span class="timer" id="timer-${order.id}">${timeStr}</span>
            </div>
            <div class="phone-row">
                <span class="phone-number">${formatPhoneNumber(order.phone || order.number)}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone || order.number}')"><i class="fas fa-copy"></i></button>
            </div>
            <div class="otp-display ${hasSms ? 'success-glow' : ''}">${otpHtml}</div>
            
            <div class="action-buttons-grid">
                ${cancelBtnHtml}
                <button class="btn-success" onclick="finishOrder(${order.id})" ${hasSms ? '' : 'disabled'}><i class="fas fa-check-double"></i> Selesai (Manual)</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ================= SINKRONISASI SERVER MASTER (Polling) =================
async function pollActiveOrders() {
    if (isPolling) return;
    isPolling = true;
    
    // API GET /orders/active
    const res = await apiCall('/orders/active', 'GET');
    
    if (res.success && res.data) {
        // API ADAOTP menyinkronkan seluruh order
        // Pastikan kita menambahkan timestamp lokal buatan jika server tidak mengirim created_at
        let serverOrders = res.data;
        const now = Date.now();
        
        serverOrders.forEach(so => {
            let existing = activeOrders.find(lo => lo.id == so.id);
            if (existing) {
                so.local_created_at = existing.local_created_at; // Pertahankan timer
            } else {
                so.local_created_at = now; // Catat waktu lahir lokal
            }
        });
        
        // Bandingkan apakah ada penambahan SMS baru untuk Notifikasi Suara
        serverOrders.forEach(so => {
            let oldSmsCount = 0;
            let existing = activeOrders.find(lo => lo.id == so.id);
            
            if (existing) {
                let eSms = existing.sms || existing.messages || [];
                oldSmsCount = typeof eSms === 'string' ? 1 : eSms.length;
            }
            
            let newSmsArray = so.sms || so.messages || [];
            let newSmsCount = typeof newSmsArray === 'string' ? 1 : newSmsArray.length;
            
            if (newSmsCount > oldSmsCount) {
                // Mainkan suara jika ada SMS baru masuk (Multi-OTP trigger)
                try { if (typeof notifSound !== 'undefined') { notifSound.play().catch(e=>{}); } } catch (sndErr) {}
            }
        });

        activeOrders = serverOrders;
        renderActiveOrders();
    }
    
    isPolling = false;
    
    // Adaptive Polling: Karena API me-return SEMUA pesanan sekaligus, 1 request sudah cukup untuk semua.
    // Kita panggil tiap 5 detik (12 request/menit, sangat aman dari batas 100 req/min)
    if (pollingTimeout) clearTimeout(pollingTimeout);
    let nextDelay = activeOrders.length > 0 ? 5000 : 10000;
    pollingTimeout = setTimeout(pollActiveOrders, nextDelay);
}

function startPolling() {
    if (pollingTimeout) clearTimeout(pollingTimeout);
    pollActiveOrders();
}

// ================= AKSI BATAL & SELESAI =================
window.cancelOrder = async function(orderId) {
    const card = document.getElementById(`order-card-${orderId}`);
    if(card) card.style.opacity = '0.5';
    
    // API DELETE /orders/{id}
    const res = await apiCall(`/orders/${orderId}`, 'DELETE');
    if (res.success) {
        showToast("Pesanan Dibatalkan");
        saveToHistory(orderId, "BATAL");
        pollActiveOrders(); // Sync
        fetchProfile(); // Kembalikan saldo
    } else {
        showToast(res.message || "Gagal membatalkan", "error");
        if(card) card.style.opacity = '1';
    }
}

window.finishOrder = async function(orderId) {
    const card = document.getElementById(`order-card-${orderId}`);
    if(card) card.style.opacity = '0.5';
    
    // API POST /orders/{id}/finish
    const res = await apiCall(`/orders/${orderId}/finish`, 'POST');
    if (res.success) {
        showToast("Siklus OTP Selesai!");
        saveToHistory(orderId, "SELESAI");
        pollActiveOrders(); // Sync
    } else {
        showToast(res.message || "Gagal Finish", "error");
        if(card) card.style.opacity = '1';
    }
}

// ================= MESIN WAKTU & RENDER (WEB WORKER) =================
function startTimerTick() {
    const runTick = () => {
        let needsRender = false;
        const now = Date.now();
        
        for (let i = 0; i < activeOrders.length; i++) {
            let o = activeOrders[i];
            let cTime = o.created_at ? new Date(o.created_at).getTime() : (o.local_created_at || now);
            
            // Render ulang visualisasi timer Batal dan 20 Menit secara lokal
            const timerEl = document.getElementById(`timer-${o.id}`);
            if (timerEl) {
                const left = (cTime + 1200000) - now; 
                let m = Math.floor(Math.max(0, left) / 60000); 
                let s = Math.floor((Math.max(0, left) % 60000) / 1000);
                timerEl.innerText = left > 0 ? `${m}:${s<10?'0':''}${s}` : 'Habis';
                if (left <= 180000) timerEl.style.color = "var(--danger-color)";
                else timerEl.style.color = "var(--text-primary)";
            }
            
            // Render hitung mundur Tombol Batal 60 Detik
            let smsArray = o.sms || o.messages || []; 
            if (!smsArray.length || smsArray.length === 0) {
                let waitSecs = 60 - Math.floor((now - cTime) / 1000);
                if (waitSecs === 0) needsRender = true; // Picu render ulang saat gembok lepas
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

// ================= RIWAYAT LOKAL =================
function saveToHistory(orderId, finalStatus) { 
    const order = activeOrders.find(o => o.id == orderId);
    if (!order) return; 
    
    let smsArray = order.sms || order.messages || [];
    let lastOtp = typeof smsArray === 'string' ? smsArray : (smsArray.length > 0 ? smsArray[smsArray.length-1] : "-");
    
    const historyItem = { id: order.id, phone: order.phone || order.number, serviceName: order.service || currentServiceName, otp: lastOtp, status: finalStatus, date: Date.now() }; 
    orderHistory.unshift(historyItem); 
    if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem('adaotp_history', JSON.stringify(orderHistory)); 
    renderHistory(); 
}

window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); renderHistory(); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Bersihkan riwayat?")) { orderHistory = []; localStorage.removeItem('adaotp_history'); renderHistory(); } }

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
                <span>ID: #${item.id}</span><span>${timeStr}</span>
            </div>
            ${item.status === 'SELESAI' ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px;">${item.otp}</div>` : ''}
        `;
        list.appendChild(card);
    });
}
