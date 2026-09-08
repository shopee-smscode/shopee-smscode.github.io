const API_BASE_URL = "https://adaotp.com/api/v1";
const DEFAULT_API_KEY = "4qtZsbiCYc9fjVenBVVV2CWAlEW0ISzQ"; 

let apiKey = localStorage.getItem('adaotp_api_key') || DEFAULT_API_KEY; 

// Pemaksaan reset ke versi paling mutlak
if (!localStorage.getItem('adaotp_shopee_forced_v2.1')) {
    localStorage.removeItem('adaotp_service_id');
    localStorage.removeItem('adaotp_service_name');
    localStorage.setItem('adaotp_shopee_forced_v2.1', 'true');
}

let activeOrders = []; 
let orderHistory = JSON.parse(localStorage.getItem('adaotp_history')) || [];
let allServices = [];

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

async function apiCall(endpoint, method = 'GET', urlParams = "") {
    if (!apiKey) return { success: false, message: "API Key Kosong" };
    
    let cacheBuster = `_t=${Date.now()}`;
    let finalParams = urlParams ? `${urlParams}&${cacheBuster}` : cacheBuster;
    
    let url = `${API_BASE_URL}${endpoint}?apikey=${apiKey}&${finalParams}`;
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

// ================= MESIN EKSTRAKTOR ABSOLUT =================
// Mengekstrak data pesanan dalam bentuk apa pun, sedalam apa pun
function extractAnyOrder(res) {
    let orders = [];
    let seenIds = new Set();

    function traverse(node, parentKey) {
        if (!node || typeof node !== 'object') return;
        
        let oId = node.id || node.order_id || node.order;
        let oPhone = node.phone || node.number || node.phone_number;
        let oSms = node.sms || node.messages || node.status;
        
        let hasTraits = (oPhone !== undefined || oSms !== undefined || node.service !== undefined);
        
        if (oId !== undefined && hasTraits) {
            if (!seenIds.has(String(oId))) {
                seenIds.add(String(oId));
                node.id = oId;
                orders.push(node);
            }
        } else if (parentKey !== null && !isNaN(parentKey) && hasTraits) {
            if (!seenIds.has(String(parentKey))) {
                seenIds.add(String(parentKey));
                node.id = parentKey;
                orders.push(node);
            }
        }
        
        for (let k in node) {
            if (typeof node[k] === 'object') {
                traverse(node[k], k);
            } else if (typeof node[k] === 'string' && !isNaN(k) && node[k].length >= 10) {
                // Menangkap objek aneh {"19027911": "083131805642"}
                if (!seenIds.has(String(k))) {
                    seenIds.add(String(k));
                    orders.push({ id: k, phone: node[k] });
                }
            }
        }
    }
    
    traverse(res, null);
    return orders;
}

function guessOperator(phone) {
    if (!phone || String(phone).trim() === "" || String(phone).includes("Menyiapkan")) return "MENCARI...";
    let p = String(phone).replace(/\D/g, "");
    if (p.startsWith("62")) p = "0" + p.substring(2);
    let prefix = p.substring(0, 4);
    const telkomsel = ["0811","0812","0813","0821","0822","0823","0851","0852","0853"];
    const indosat = ["0814","0815","0816","0855","0856","0857","0858"];
    const xl = ["0817","0818","0819","0859","0877","0878"];
    const axis = ["0831","0832","0833","0838"];
    const three = ["0895","0896","0897","0898","0899"];
    const smartfren = ["0881","0882","0883","0884","0885","0886","0887","0888","0889"];
    
    if (telkomsel.includes(prefix)) return "TELKOMSEL";
    if (indosat.includes(prefix)) return "INDOSAT";
    if (xl.includes(prefix)) return "XL";
    if (axis.includes(prefix)) return "AXIS";
    if (three.includes(prefix)) return "THREE";
    if (smartfren.includes(prefix)) return "SMARTFREN";
    return "ACAK"; 
}

window.onload = () => {
    if (currentServiceName) { document.getElementById('btnServiceSelectText').innerHTML = currentServiceName; }
    startPolling();
    startTimerTick();
    initApp();
};

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { startPolling(); startTimerTick(); }
});
window.addEventListener('online', () => { showToast("🌐 Online", "success"); startPolling(); });

window.forceRefresh = async function() {
    const icon = document.getElementById('refreshIcon');
    if(icon) icon.classList.add('fa-spin');
    
    showToast("Sinkronisasi manual...", "warning");
    
    isPolling = false;
    if (pollingTimeout) clearTimeout(pollingTimeout);
    
    await fetchProfile();
    await pollActiveOrders(true);
    
    if(icon) icon.classList.remove('fa-spin');
    showToast("Sinkronisasi Selesai!", "success");
}

function openSettingsModal() { 
    document.getElementById('settingsApiKey').value = apiKey === DEFAULT_API_KEY ? "" : apiKey; 
    document.getElementById('settingsModal').classList.remove('hidden'); 
}
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }
async function saveSettings() {
    let inputKey = document.getElementById('settingsApiKey').value.trim();
    apiKey = inputKey ? inputKey : DEFAULT_API_KEY;
    localStorage.setItem('adaotp_api_key', apiKey); 
    closeSettingsModal(); 
    showToast(inputKey ? "API Key Tersimpan!" : "Menggunakan API Bawaan!"); 
    initApp();
}

async function initApp() {
    fetchProfile(); 
    await fetchServices();
}

async function fetchProfile() {
    try {
        const res = await apiCall('/profile', 'GET');
        if ((res.success || res.status) && res.data) {
            document.getElementById('currentAccountEmail').innerText = res.data.user ? res.data.user.email : "Akun Aktif";
            document.getElementById('balanceDisplay').innerText = res.data.user ? res.data.user.balance : res.data.balance || "Rp -";
        } else {
            document.getElementById('balanceDisplay').innerText = "Error API";
        }
    } catch (e) {
        document.getElementById('balanceDisplay').innerText = "Gagal Terhubung";
    }
}

async function fetchServices() {
    document.getElementById('btnServiceSelectText').innerText = "Memuat...";
    try {
        const res = await apiCall('/services', 'GET');
        if (res.success || res.status) {
            let dataTarget = res.data.data ? res.data.data : res.data;
            let servicesArray = Array.isArray(dataTarget) ? dataTarget : Object.values(dataTarget);
            allServices = servicesArray.sort((a, b) => String(a.text || a.name).localeCompare(String(b.text || b.name)));
            
            let target = null;
            if (currentServiceId) target = allServices.find(s => String(s.id) === String(currentServiceId));
            if (!target) target = allServices.find(s => String(s.text || s.name || "").toLowerCase().includes("shopee"));
            if (!target && allServices.length > 0) target = allServices[0];
            
            if (target) {
                currentServiceId = target.id;
                currentServiceName = target.text || target.name;
            }
            
            updateServiceUI();
            await fetchCountries();
        } else {
            document.getElementById('btnServiceSelectText').innerText = "Gagal Memuat Layanan";
        }
    } catch (e) {
        document.getElementById('btnServiceSelectText').innerText = "Error Layanan";
    }
}

function updateServiceUI() {
    document.getElementById('btnServiceSelectText').innerHTML = currentServiceName;
    localStorage.setItem('adaotp_service_id', currentServiceId);
    localStorage.setItem('adaotp_service_name', currentServiceName);
}

// LOGIKA NEGARA: Jika kosong, paksa ke Mode Otomatis tanpa menyebabkan Error!
async function fetchCountries() {
    const btn = document.getElementById('btnOrder');
    const priceBox = document.getElementById('servicePriceBox');
    btn.disabled = true;
    priceBox.innerText = "...";

    if (!currentServiceId) return;
    
    try {
        const res = await apiCall(`/services/${currentServiceId}/countries`, 'GET');
        let foundId = "";
        let foundPrice = "";
        
        if (res.success || res.status) {
            let dataArr = Array.isArray(res.data) ? res.data : Object.values(res.data || {});
            for (let c of dataArr) {
                let strVal = JSON.stringify(c).toLowerCase();
                if (strVal.includes("indonesia") || strVal.includes("indo")) {
                    foundId = c.id || c.country_id || c.value;
                    foundPrice = c.price || c.cost || "";
                    break;
                }
            }
        }
        
        if (foundId) {
            currentCountryId = foundId; 
            localStorage.setItem('adaotp_country_id', currentCountryId);
            priceBox.innerText = foundPrice ? `Rp ${foundPrice}` : "Tersedia";
            priceBox.style.color = "var(--success-color)";
        } else {
            // JIKA SERVER MENGHAPUS NAMA INDONESIA, KITA PAKSA ID 1
            currentCountryId = "1"; 
            localStorage.setItem('adaotp_country_id', currentCountryId);
            priceBox.innerText = "Coba Otomatis";
            priceBox.style.color = "var(--warning-color)";
        }
    } catch (e) {
        currentCountryId = "1";
        priceBox.innerText = "Fallback";
    } finally {
        // Tombol selalu aktif agar Anda bisa terus order!
        btn.disabled = false;
    }
}

window.openServiceModal = function() { document.getElementById('serviceModal').classList.remove('hidden'); document.getElementById('searchServiceInput').value = ''; filterServices(); }
window.closeServiceModal = function() { document.getElementById('serviceModal').classList.add('hidden'); }
window.filterServices = function() {
    const q = document.getElementById('searchServiceInput').value.toLowerCase();
    const container = document.getElementById('serviceListContainer');
    container.innerHTML = '';
    const filtered = allServices.filter(s => String(s.text || s.name).toLowerCase().includes(q));
    
    if(filtered.length === 0) { container.innerHTML = '<div class="status-text-mini">Tidak ditemukan.</div>'; return; }

    filtered.forEach(svc => {
        const isActive = (String(svc.id) === String(currentServiceId));
        const btn = document.createElement('div');
        btn.style = `width: 100%; padding: 10px; border-radius: 10px; font-size: 13px; font-weight: bold; display: flex; align-items: center; border: 2px solid ${isActive ? 'var(--primary-color)' : 'var(--border-color)'}; background: ${isActive ? 'var(--bg-body)' : 'var(--bg-card)'}; color: ${isActive ? 'var(--primary-color)' : 'var(--text-primary)'}; cursor: pointer; margin-bottom: 6px;`;
        
        let iconHtml = svc.icon ? `<img src="${svc.icon}" style="width:24px; height:24px; border-radius:6px; margin-right:10px;">` : `<i class="fas fa-cube" style="margin-right:10px;"></i>`;
        
        btn.innerHTML = `${iconHtml} <span>${svc.text || svc.name}</span>`;
        btn.onclick = () => {
            currentServiceId = svc.id; 
            currentServiceName = svc.text || svc.name; 
            updateServiceUI(); 
            closeServiceModal();
            fetchCountries(); 
        };
        container.appendChild(btn);
    });
}

// ================= INJEKSI PAKSA LOKAL (ANTI-BLANK MUTLAK) =================
window.createNewOrder = async function() {
    const btn = document.getElementById('btnOrder');
    btn.disabled = true; btn.innerText = "MEMPROSES...";
    
    document.getElementById('activeOrdersContainer').innerHTML = '<div class="status-text-mini">Memaksa masuk ke layar...</div>';
    
    const params = `country=${currentCountryId || '1'}&service_id=${currentServiceId}`;
    
    try {
        const res = await apiCall('/orders', 'POST', params);
        
        if (res.success || res.status || res.id || (res.data && res.data.id)) {
            showToast("Nomor Berhasil Dipesan!");
            fetchProfile(); 
            
            let newOrders = extractAnyOrder(res);
            
            // LOGIKA INJEKSI PAKSA:
            if (newOrders.length > 0) {
                newOrders[0].local_created_at = Date.now();
                if(!activeOrders.find(o => String(o.id) === String(newOrders[0].id))) {
                    activeOrders.unshift(newOrders[0]); 
                }
            } else {
                // JIKA DATA DARI SERVER BENAR-BENAR RUSAK, KITA BUAT DATA PALSU SEMENTARA AGAR LAYAR TIDAK KOSONG
                let fallbackId = res.id || (res.data ? res.data.id : null) || res.order_id || Date.now();
                let fallbackPhone = res.phone || res.number || (res.data ? (res.data.phone || res.data.number) : "") || "Menyiapkan...";
                
                activeOrders.unshift({
                    id: fallbackId,
                    phone: fallbackPhone,
                    local_created_at: Date.now(),
                    normalized_sms: []
                });
            }
        } else {
            showToast(res.message || "Gagal memesan nomor", "error");
        }
    } catch(e) {
        showToast("Error Koneksi!", "error");
    } finally {
        // PAKSA MENGGAMBAR LAYAR DETIK ITU JUGA SEBELUM POLLING
        renderActiveOrders(); 
        if (pollingTimeout) clearTimeout(pollingTimeout);
        pollActiveOrders(); 
        btn.disabled = false; btn.innerText = "PESAN NOMOR BARU";
    }
}

function formatPhoneNumber(phone) { 
    if (!phone || String(phone).trim() === "") return "Menyiapkan Nomor..."; 
    let p = String(phone).replace(/\D/g, "");
    if (p.startsWith("62")) { p = "0" + p.substring(2); } 
    return p.replace(/(.{4})/g, '$1 ').trim(); 
}

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
            
            const now = Date.now();
            let cTime = order.local_created_at || now; 
            
            let canCancel = (now - cTime) >= 60000;
            let cancelBtnHtml = "";
            let finishBtnHtml = "";
            
            let smsArray = order.normalized_sms || []; 
            const hasSms = smsArray.length > 0;
            
            const left = (cTime + 4800000) - now; 
            let m = Math.floor(Math.max(0, left) / 60000); 
            let s = Math.floor((Math.max(0, left) % 60000) / 1000);
            let timeStr = left > 0 ? `${m}:${s<10?'0':''}${s}` : 'Habis';
            
            if (!hasSms) {
                if (canCancel) {
                    cancelBtnHtml = `<button class="btn-danger" onclick="cancelOrder('${order.id}')">BATAL</button>`;
                } else {
                    let waitSecs = 60 - Math.floor((now - cTime) / 1000);
                    cancelBtnHtml = `<button class="btn-danger" disabled>BATAL (${Math.max(0, waitSecs)}s)</button>`;
                }
                finishBtnHtml = `<button class="btn-success" disabled>SELESAI</button>`;
            } else {
                cancelBtnHtml = `<button class="btn-danger" disabled>BATAL</button>`;
                finishBtnHtml = `<button class="btn-success" onclick="finishOrder('${order.id}')">SELESAI</button>`;
            }

            let otpHtml = "";
            if (hasSms) {
                let stackHtml = smsArray.map((msg) => {
                    let code = String(msg || "");
                    let extracted = code.match(/\b\d{4,8}\b/);
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
            
            let srvNameRaw = order.service || order.service_name;
            let finalSrvName = currentServiceName;
            if (typeof srvNameRaw === 'string') { finalSrvName = srvNameRaw; }
            else if (typeof srvNameRaw === 'object' && srvNameRaw !== null) { finalSrvName = srvNameRaw.name || srvNameRaw.text || currentServiceName; }
            
            let phoneNumber = order.phone || order.number || order.phone_number || "Menyiapkan Nomor...";
            let opName = guessOperator(phoneNumber);
            
            card.innerHTML = `
                <div class="order-header">
                    <div>
                        <div class="order-id-label">#${order.id} (${String(finalSrvName).toUpperCase()} • ${opName})</div>
                    </div>
                    <span class="timer" id="timer-${order.id}">${timeStr}</span>
                </div>
                <div class="phone-row">
                    <span class="phone-number">${formatPhoneNumber(phoneNumber)}</span>
                    <button class="btn-copy" onclick="copyToClipboard('${phoneNumber}')"><i class="fas fa-copy"></i></button>
                </div>
                <div class="otp-display ${hasSms ? 'success-glow' : ''}">${otpHtml}</div>
                
                <div class="action-buttons-grid">
                    ${cancelBtnHtml}
                    ${finishBtnHtml}
                </div>
            `;
            container.appendChild(card);
        } catch (err) {
            console.error("Gagal menggambar satu kotak", err);
        }
    });
}

async function pollActiveOrders(isManual = false) {
    if (isPolling && !isManual) return;
    isPolling = true;
    
    try {
        const res = await apiCall('/orders/active', 'GET');
        
        if (res.success || res.status || res.data !== undefined) {
            let serverOrders = extractAnyOrder(res);
            let prevIds = activeOrders.map(o => String(o.id));
            let mergedOrders = [...activeOrders];
            const now = Date.now();
            let isChanged = false;

            serverOrders.forEach(so => {
                let existingIdx = mergedOrders.findIndex(lo => String(lo.id) === String(so.id));
                
                let rawSoSms = so.sms || so.messages || so.received_sms || [];
                let soSmsArray = [];
                if (Array.isArray(rawSoSms)) {
                    soSmsArray = rawSoSms;
                } else if (typeof rawSoSms === 'string' && rawSoSms.trim() !== '') {
                    soSmsArray = rawSoSms.includes(',') ? rawSoSms.split(',').map(s=>s.trim()) : [rawSoSms.trim()];
                }
                so.normalized_sms = soSmsArray;

                if (existingIdx !== -1) {
                    so.local_created_at = mergedOrders[existingIdx].local_created_at;
                    
                    let oldSmsArray = mergedOrders[existingIdx].normalized_sms || [];
                    if (soSmsArray.length > oldSmsArray.length) {
                        isChanged = true;
                        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (vErr) {}
                        try { if (typeof notifSound !== 'undefined') { notifSound.play().catch(e=>{}); } } catch (sndErr) {}
                    }
                    
                    // Jangan timpa data lokal jika data server tidak punya nomor telepon
                    if(so.phone || so.number) {
                        mergedOrders[existingIdx] = so; 
                    } else {
                        mergedOrders[existingIdx].normalized_sms = so.normalized_sms;
                    }
                    
                } else {
                    so.local_created_at = now;
                    mergedOrders.unshift(so); 
                    isChanged = true;
                    if (soSmsArray.length > 0) {
                        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (vErr) {}
                        try { if (typeof notifSound !== 'undefined') { notifSound.play().catch(e=>{}); } } catch (sndErr) {}
                    }
                }
            });
            
            mergedOrders = mergedOrders.filter(o => {
                let cTime = o.local_created_at || now;
                return (now - cTime) < 4800000; 
            });

            activeOrders = mergedOrders;
            
            let currentIds = activeOrders.map(o => String(o.id));
            let hasRemoved = prevIds.some(id => !currentIds.includes(id));
            if (hasRemoved || isChanged) {
                fetchProfile();
            }

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
    
    const res = await apiCall(`/orders/${orderId}`, 'DELETE');
    if (res.success || res.status) {
        showToast("Pesanan Dibatalkan");
        saveToHistory(orderId, "BATAL");
        activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId)); 
        renderActiveOrders();
        fetchProfile(); 
    } else {
        showToast(res.message || "Gagal membatalkan", "error");
        if(card) card.style.opacity = '1';
    }
}

window.finishOrder = async function(orderId) {
    const card = document.getElementById(`order-card-${orderId}`);
    if(card) card.style.opacity = '0.5';
    
    const res = await apiCall(`/orders/${orderId}/finish`, 'POST');
    if (res.success || res.status) {
        showToast("Siklus OTP Selesai!");
        saveToHistory(orderId, "SELESAI");
        activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId)); 
        renderActiveOrders(); 
        fetchProfile(); 
    } else {
        showToast(res.message || "Gagal Finish", "error");
        if(card) card.style.opacity = '1';
    }
}

function startTimerTick() {
    const runTick = () => {
        let needsRender = false;
        const now = Date.now();
        
        for (let i = activeOrders.length - 1; i >= 0; i--) {
            let o = activeOrders[i];
            let cTime = o.local_created_at || now;
            
            const left = (cTime + 4800000) - now; 
            
            if (left <= 0) {
                activeOrders.splice(i, 1);
                needsRender = true;
                continue;
            }
            
            const timerEl = document.getElementById(`timer-${o.id}`);
            if (timerEl) {
                let m = Math.floor(Math.max(0, left) / 60000); 
                let s = Math.floor((Math.max(0, left) % 60000) / 1000);
                timerEl.innerText = left > 0 ? `${m}:${s<10?'0':''}${s}` : 'Habis';
                if (left <= 180000) timerEl.style.color = "var(--danger-color)";
                else timerEl.style.color = "var(--text-primary)";
            }
            
            let smsArray = o.normalized_sms || []; 
            if (smsArray.length === 0) {
                let waitSecs = 60 - Math.floor((now - cTime) / 1000);
                if (waitSecs === 0) needsRender = true; 
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
    const order = activeOrders.find(o => String(o.id) === String(orderId));
    if (!order) return; 
    
    let smsArray = order.normalized_sms || [];
    let lastOtp = smsArray.length > 0 ? smsArray[smsArray.length-1] : "-";
    
    let srvNameRaw = order.service || order.service_name;
    let srv = currentServiceName;
    if (typeof srvNameRaw === 'string') { srv = srvNameRaw; }
    else if (typeof srvNameRaw === 'object' && srvNameRaw !== null) { srv = srvNameRaw.name || srvNameRaw.text || currentServiceName; }
            
    let ph = order.phone || order.number || order.phone_number || "";
    
    const historyItem = { id: order.id, phone: ph, serviceName: srv, otp: lastOtp, status: finalStatus, date: Date.now() }; 
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
