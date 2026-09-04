// --- KONFIGURASI API OTP CEPAT ---
const API_BASE_URL = "https://otpcepat.org/api/handler_api.php";

let apiKey = localStorage.getItem('otp_api_key') || "";
let activeOrders = JSON.parse(localStorage.getItem('otp_active_orders')) || [];
let orderHistory = JSON.parse(localStorage.getItem('otp_history')) || [];
let allServices = [];
let allOperators = [];

let currentCountryId = ""; // Akan diisi otomatis menjadi ID Indonesia
let currentCategory = localStorage.getItem('otp_category') || "reguler";
let currentServiceId = localStorage.getItem('otp_service') || "";
let currentServiceName = localStorage.getItem('otp_service_name') || "";
let currentServicePrice = localStorage.getItem('otp_service_price') || "";
let currentOperator = localStorage.getItem('otp_operator') || "random";

let pollingInterval = null;

const rpFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

window.onload = () => {
    if (!apiKey) {
        openSettingsModal();
    } else {
        initApp();
    }
    renderOrders();
    startPolling();
};

function showToast(pesan, type = "success") { 
    const t = document.getElementById("toast"); 
    t.innerHTML = pesan; 
    if (type === "error") { t.style.backgroundColor = "var(--danger-color)"; t.style.color = "#ffffff"; } 
    else if (type === "warning") { t.style.backgroundColor = "var(--warning-color)"; t.style.color = "#000000"; } 
    else { t.style.backgroundColor = "var(--success-color)"; t.style.color = "#000"; } 
    t.classList.add("show"); 
    setTimeout(() => t.classList.remove("show"), 3000); 
}

function copyToClipboard(t) { 
    const ta = document.createElement("textarea"); ta.value = t; 
    ta.style.position = "absolute"; ta.style.left = "-9999px"; 
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); 
    showToast("Berhasil disalin!"); document.body.removeChild(ta); 
}

// ================= API CALLER UTAMA =================
async function apiCall(action, extraParams = "") {
    if (!apiKey) return { status: "false", msg: "API Key Kosong" };
    const url = `${API_BASE_URL}?api_key=${apiKey}&action=${action}${extraParams}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (err) {
        return { status: "false", msg: "Gagal terhubung ke server API OTP Cepat." };
    }
}

// ================= INIT & SETTINGS =================
function openSettingsModal() { 
    document.getElementById('settingsApiKey').value = apiKey;
    document.getElementById('settingsModal').classList.remove('hidden'); 
}
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }

async function saveSettings() {
    apiKey = document.getElementById('settingsApiKey').value.trim();
    localStorage.setItem('otp_api_key', apiKey);
    closeSettingsModal();
    showToast("API Key Disimpan!");
    initApp();
}

async function initApp() {
    document.getElementById('categorySelect').value = currentCategory;
    await fetchBalance();
    await lockCountryToIndonesia();
}

async function fetchBalance() {
    document.getElementById('balanceDisplay').innerText = "Memuat...";
    const res = await apiCall('getBalance');
    if (res.status === "true" || res.status === true) {
        document.getElementById('currentAccountEmail').innerText = res.data.email || "Akun Terhubung";
        document.getElementById('balanceDisplay').innerText = rpFormatter.format(res.data.saldo);
    } else {
        document.getElementById('balanceDisplay').innerText = "Gagal";
        showToast(res.msg, "error");
    }
}

// ================= MENGUNCI NEGARA KE INDONESIA =================
async function lockCountryToIndonesia() {
    document.getElementById('btnServiceSelectText').innerHTML = `Mencari Server ID... <i class="fas fa-spinner fa-spin"></i>`;
    const res = await apiCall('getCountries');
    if (res.status === "true" || res.status === true) {
        let indo = res.data.find(c => c.countryName.toLowerCase() === "indonesia");
        if (indo) {
            currentCountryId = indo.countryID;
        } else {
            // Fallback: Jika tak ketemu string 'indonesia', ambil index ID pertama
            currentCountryId = res.data.length > 0 ? res.data[0].countryID : "1";
        }
        await fetchServices();
    } else {
        document.getElementById('btnServiceSelectText').innerText = "Gagal Kunci Negara";
    }
}

// ================= KATEGORI & LAYANAN =================
window.onCategoryChanged = async function() {
    currentCategory = document.getElementById('categorySelect').value;
    localStorage.setItem('otp_category', currentCategory);
    
    document.getElementById('btnServiceSelectText').innerText = "Beralih Kategori...";
    
    // Hapus sesi layanan agar sistem memancing Shopee di kategori baru
    currentServiceId = ""; currentServiceName = ""; currentServicePrice = "";
    
    await fetchServices();
}

async function fetchServices() {
    document.getElementById('btnServiceSelectText').innerHTML = `Memuat Harga... <i class="fas fa-spinner fa-spin"></i>`;
    
    // Pilih Endpoint berdasarkan kategori (Reguler vs Promo & Prioritas)
    const res = currentCategory === "spesial" 
        ? await apiCall('getSpecialServices') 
        : await apiCall('getServices', `&country_id=${currentCountryId}`);
        
    if (res.status === "true" || res.status === true) {
        // Urutkan sesuai Abjad
        allServices = res.data.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
        
        // 1. Jika pengguna sudah punya memori layanan sebelumnya (dan layanannya ada di kategori ini)
        let targetSvc = allServices.find(s => s.serviceID === currentServiceId);
        
        // 2. Jika gagal, JADIKAN SHOPEE SEBAGAI DEFAULT
        if (!targetSvc) {
            targetSvc = allServices.find(s => s.serviceName.toLowerCase().includes("shopee"));
        }
        
        // 3. Fallback terakhir jika Shopee tidak ada di server ini
        if (!targetSvc && allServices.length > 0) {
            targetSvc = allServices[0];
        }
        
        if (targetSvc) {
            currentServiceId = targetSvc.serviceID;
            currentServiceName = targetSvc.serviceName;
            currentServicePrice = targetSvc.price;
        }
        
        updateServiceButtonUI();
        await fetchOperators();
    } else {
        document.getElementById('btnServiceSelectText').innerText = "Gagal Memuat Layanan";
    }
}

function updateServiceButtonUI() {
    let btnText = document.getElementById('btnServiceSelectText');
    let displayPrice = rpFormatter.format(currentServicePrice);
    btnText.innerHTML = `${currentServiceName} <span style="color: var(--text-primary); font-size: 11px;">(${displayPrice})</span>`;
    localStorage.setItem('otp_service', currentServiceId);
    localStorage.setItem('otp_service_name', currentServiceName);
    localStorage.setItem('otp_service_price', currentServicePrice);
}

// --- MODAL LAYANAN ---
window.openServiceModal = function() { 
    document.getElementById('serviceModal').classList.remove('hidden'); 
    document.getElementById('searchServiceInput').value = ''; 
    filterServices(); 
}
window.closeServiceModal = function() { document.getElementById('serviceModal').classList.add('hidden'); }

window.filterServices = function() {
    const query = document.getElementById('searchServiceInput').value.toLowerCase();
    const container = document.getElementById('serviceListContainer');
    container.innerHTML = '';
    
    const filtered = allServices.filter(s => s.serviceName.toLowerCase().includes(query));
    if(filtered.length === 0) { container.innerHTML = '<div class="status-text-mini">Tidak ditemukan.</div>'; return; }

    filtered.forEach(svc => {
        const isActive = (svc.serviceID === currentServiceId);
        const btn = document.createElement('div');
        let formattedPrice = rpFormatter.format(svc.price);
        
        btn.style = `width: 100%; padding: 12px 14px; border-radius: 10px; font-size: 13px; font-weight: bold; display: flex; align-items: center; justify-content: space-between; border: 2px solid ${isActive ? 'var(--primary-color)' : 'var(--border-color)'}; background: ${isActive ? 'var(--bg-body)' : 'var(--bg-card)'}; color: ${isActive ? 'var(--primary-color)' : 'var(--text-primary)'}; cursor: pointer; margin-bottom: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);`;
        
        btn.innerHTML = `<div style="flex:1;">${svc.serviceName}</div><div style="font-size:11px; color: ${isActive ? 'var(--primary-color)' : 'var(--success-color)'}; font-weight: 900;">${formattedPrice}</div>`;
        btn.onclick = () => {
            currentServiceId = svc.serviceID;
            currentServiceName = svc.serviceName;
            currentServicePrice = svc.price;
            updateServiceButtonUI();
            closeServiceModal();
        };
        container.appendChild(btn);
    });
}

// ================= OPERATOR =================
function getOperatorLogo(opName) { 
    const i = String(opName).toLowerCase(); 
    if (i.includes('telkomsel')) return 'https://assets.telkomsel.com/public/app-logo/2021-06/telkomsel-logo.png'; 
    if (i.includes('indosat') || i.includes('im3')) return 'https://im3-img.indosatooredoo.com/indosatassets/images/myim3_app_footer.svg'; 
    if (i.includes('xl')) return 'https://iconlogovector.com/uploads/images/2024/09/lg-66ef50c24df06-XL-Axiata-operator-telekomunik.webp'; 
    if (i.includes('axis')) return 'https://www.axis.co.id/img/common/logo.svg'; 
    if (i.includes('three') || i.includes('tri') || i === '3') return 'https://www.three.co.uk/content/dam/threedigital/static-files/components/header/three-logo.svg'; 
    if (i.includes('smartfren')) return 'https://down-id.img.susercontent.com/file/id-11134207-8224s-mkkmirlvdurn5d@resize_w900_nl.webp'; 
    return 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png'; 
}

async function fetchOperators() {
    const list = document.getElementById('productList');
    list.innerHTML = '<div class="status-text-mini">Memuat operator...</div>';
    document.getElementById('btnOrder').disabled = true;

    const res = await apiCall('getOperators', `&country_id=${currentCountryId}`);
    if (res.status === "true" || res.status === true) {
        allOperators = res.data; // Array string: ["random", "telkomsel", ...]
        list.innerHTML = '';
        
        if (!allOperators.includes(currentOperator)) currentOperator = allOperators[0] || "random";
        
        allOperators.forEach(op => {
            const card = document.createElement("div"); 
            card.className = "product-card"; 
            if (currentOperator === op) card.classList.add('selected');
            
            let displayName = op === "random" ? "ACAK" : op.toUpperCase();
            let logoImg = getOperatorLogo(op);
            
            card.innerHTML = `<div class="op-logo-container"><img src="${logoImg}" onerror="this.src='https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';" class="op-logo"></div><div class="product-info"><h4>${displayName}</h4></div>`;
            
            card.onclick = () => { 
                document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); 
                card.classList.add('selected'); 
                currentOperator = op;
                localStorage.setItem('otp_operator', currentOperator);
            };
            list.appendChild(card);
        });
        
        document.getElementById('btnOrder').disabled = false;
    } else {
        list.innerHTML = '<div class="status-text-mini" style="color:var(--danger-color);">Gagal memuat operator.</div>';
    }
}

// ================= PESANAN (ORDER) =================
window.onOrderButtonClicked = async function() {
    const btn = document.getElementById('btnOrder');
    btn.disabled = true; btn.innerText = "MEMPROSES...";
    
    const res = await apiCall('get_order', `&operator_id=${currentOperator}&service_id=${currentServiceId}&country_id=${currentCountryId}`);
    
    if (res.status === "true" || res.status === true) {
        const orderData = res.data;
        let finalPrice = orderData.price || currentServicePrice;
        let opNameDisplay = currentOperator === "random" ? "ACAK" : currentOperator;
        
        activeOrders.unshift({ 
            id: orderData.order_id, 
            phone: orderData.number, 
            serviceName: currentServiceName,
            operatorName: opNameDisplay,
            price: finalPrice, 
            otp: null, 
            status: "Waiting SMS", 
            expiresAt: Date.now() + (20 * 60 * 1000)
        });
        saveActiveOrders();
        renderOrders();
        fetchBalance();
        copyToClipboard(orderData.number);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        showToast(res.msg, "error");
    }
    
    btn.disabled = false; btn.innerText = "PESAN NOMOR BARU";
}

function saveActiveOrders() {
    localStorage.setItem('otp_active_orders', JSON.stringify(activeOrders));
}

// ================= KARTU PESANAN =================
function renderOrders() {
    const container = document.getElementById('activeOrdersContainer');
    if (activeOrders.length === 0) { 
        container.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; 
        return; 
    }
    
    container.innerHTML = "";
    activeOrders.forEach(order => {
        const now = Date.now();
        const left = order.expiresAt - now;
        if (left <= 0 && order.status !== "Recieved") return;

        const isSuccess = (order.status === "Recieved" || order.otp);
        const card = document.createElement("div"); 
        card.className = "order-card"; 
        card.id = `order-card-${order.id}`;

        let otpHtml = isSuccess 
            ? `<div class="otp-title">KODE OTP</div><div class="otp-code">${order.otp}</div><button class="btn-copy" onclick="copyToClipboard('${order.otp}')" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%);"><i class="fas fa-copy"></i></button>` 
            : `<div class="loader"></div><div style="font-size:11px; font-weight:800; color:var(--text-secondary); margin-top:8px;">MENUNGGU SMS...</div>`;
            
        let timerColor = left <= 300000 ? "var(--danger-color)" : "var(--primary-color)";
        let m = Math.floor(left/60000); let s = Math.floor((left%60000)/1000);
        let timeStr = `${m}:${s<10?'0':''}${s}`;
        
        let logoUrl = getOperatorLogo(order.operatorName);

        card.innerHTML = `
            <div class="order-header">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${logoUrl}" style="width: 24px; height: 24px; border-radius: 4px; background:#fff; padding:2px;">
                    <div>
                        <div class="order-id-label">#${order.id} (${order.serviceName})</div>
                        <div class="order-price">${rpFormatter.format(order.price)}</div>
                    </div>
                </div>
                <span class="timer" style="color: ${timerColor};">${isSuccess ? 'SELESAI' : timeStr}</span>
            </div>
            <div class="phone-row">
                <span class="phone-number">${formatPhoneNumber(order.phone)}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button>
            </div>
            <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div>
            <div class="action-buttons-grid">
                <button class="btn-danger" id="btn-cancel-${order.id}" onclick="setOrderStatus('${order.id}', 2)" ${isSuccess ? 'disabled' : ''}><i class="fas fa-times"></i> Batal</button>
                <button class="btn-success" id="btn-finish-${order.id}" onclick="setOrderStatus('${order.id}', 4)" ${!isSuccess ? 'disabled' : ''}><i class="fas fa-check"></i> Selesai</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ================= POLLING STATUS =================
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        let needsRender = false;
        
        for (let i = 0; i < activeOrders.length; i++) {
            let o = activeOrders[i];
            
            if (Date.now() > o.expiresAt && o.status !== "Recieved") {
                activeOrders.splice(i, 1);
                saveActiveOrders();
                needsRender = true;
                continue;
            }

            if (o.status !== "Recieved") {
                const res = await apiCall('get_status', `&order_id=${o.id}`);
                if (res.status === "true" || res.status === true) {
                    if (res.data.status === "Recieved" && res.data.sms) {
                        notifSound.play().catch(e=>{});
                        o.status = "Recieved";
                        let textSms = res.data.sms;
                        let extracted = textSms.match(/\b\d{4,8}\b/);
                        o.otp = extracted ? extracted[0] : textSms;
                        needsRender = true;
                    } else if (res.data.status === "Cancel") {
                        activeOrders.splice(i, 1);
                        needsRender = true;
                    }
                }
            }
        }
        
        if (needsRender) {
            saveActiveOrders();
            renderOrders();
            fetchBalance();
        } else if (activeOrders.length > 0) {
            renderOrders();
        }
    }, 4000); 
}

// ================= SET STATUS API (BATAL/SELESAI) =================
window.setOrderStatus = async function(orderId, statusCode) {
    const btnId = statusCode === 2 ? `btn-cancel-${orderId}` : `btn-finish-${orderId}`;
    const btn = document.getElementById(btnId);
    if(btn) btn.innerHTML = '<div class="loader"></div>';

    const res = await apiCall('set_status', `&order_id=${orderId}&status=${statusCode}`);
    
    if (res.status === "true" || res.status === true || (res.msg && res.msg.toLowerCase() === "success")) {
        let oIdx = activeOrders.findIndex(x => x.id === orderId);
        if (oIdx !== -1) {
            let orderToSave = activeOrders[oIdx];
            if (statusCode === 2) saveToHistory(orderToSave, "BATAL");
            if (statusCode === 4) saveToHistory(orderToSave, "SELESAI");
            
            activeOrders.splice(oIdx, 1);
            saveActiveOrders();
            
            if (statusCode === 2) showToast("Pesanan Dibatalkan");
            if (statusCode === 4) showToast("Pesanan Selesai");
            
            renderOrders();
            fetchBalance();
        }
    } else {
        showToast(res.msg, "error");
        renderOrders(); 
    }
}

// ================= HISTORY LOKAL =================
function saveToHistory(order, finalStatus) { 
    if (!order) return; 
    const historyItem = { 
        id: order.id, 
        phone: order.phone, 
        serviceName: order.serviceName,
        operatorName: order.operatorName,
        price: order.price, 
        otp: order.otp || "-", 
        status: finalStatus, 
        date: Date.now() 
    }; 
    orderHistory.unshift(historyItem); 
    if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem('otp_history', JSON.stringify(orderHistory)); 
    renderHistory(); 
}

window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); renderHistory(); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Bersihkan riwayat?")) { orderHistory = []; localStorage.removeItem('otp_history'); renderHistory(); } }

function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    if (orderHistory.length === 0) { list.innerHTML = '<div class="status-text-mini">Belum ada riwayat lokal.</div>'; return; } 
    list.innerHTML = "";
    
    orderHistory.forEach(item => {
        const card = document.createElement('div'); 
        card.style = "background: var(--bg-card); padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 11px;";
        
        let statusColor = "var(--text-secondary)"; 
        if (item.status === "SELESAI") statusColor = "var(--success-color)"; 
        if (item.status === "BATAL") statusColor = "var(--danger-color)";
        
        const dt = new Date(item.date); 
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: var(--text-primary); font-size: 13px; letter-spacing: 1px;">${formatPhoneNumber(item.phone)} <span style="font-size:9px; color:var(--text-secondary);">(${item.serviceName} • ${item.operatorName.toUpperCase()})</span></strong>
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
