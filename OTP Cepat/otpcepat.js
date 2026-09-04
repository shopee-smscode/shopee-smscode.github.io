// --- SUNTIKAN CSS TAMBAHAN UNTUK FITUR PESANAN LAMA HERO SMS ---
const style = document.createElement('style');
style.innerHTML = `
    .old-orders-wrapper { margin-top: 10px; }
    .btn-droplist { width: 100%; background: var(--bg-card); color: var(--text-primary); padding: 12px; border: 1px solid var(--border-color); border-radius: 12px; font-weight: 800; font-size: 13px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s; }
    .btn-droplist.open { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: none; background: var(--border-color); }
    .old-orders-content { display: none; background: var(--bg-container); border: 1px solid var(--border-color); border-top: none; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; padding: 10px; }
    .old-orders-content.show { display: block; }
    .btn-cancel-all { width: 100%; background: var(--bg-card); color: var(--danger-color); padding: 10px; border: 1px solid var(--danger-color); border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; margin-bottom: 10px; transition: 0.2s; }
    .waiting-animation { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 5px; }
    .dot-pulse { width: 8px; height: 8px; background-color: var(--text-secondary); border-radius: 50%; animation: pulse 1.5s infinite ease-in-out; }
    .dot-pulse:nth-child(2) { animation-delay: 0.2s; }
    .dot-pulse:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse { 0%, 100% { transform: scale(0.8); opacity: 0.5; } 50% { transform: scale(1.2); opacity: 1; } }
`;
document.head.appendChild(style);

// --- KONFIGURASI API OTP CEPAT ---
const API_BASE_URL = "https://otpcepat.org/api/handler_api.php";

let apiKey = localStorage.getItem('otp_api_key') || "";
let activeOrders = JSON.parse(localStorage.getItem('otp_active_orders')) || [];
let orderHistory = JSON.parse(localStorage.getItem('otp_history')) || [];
let allServices = [];
let allOperators = [];

let currentCountryId = ""; 
let currentCategory = localStorage.getItem('otp_category') || "reguler";
let currentServiceId = localStorage.getItem('otp_service') || "";
let currentServiceName = localStorage.getItem('otp_service_name') || "";
let currentServicePrice = localStorage.getItem('otp_service_price') || "";
let currentOperator = localStorage.getItem('otp_operator') || "random";

let pollingInterval = null;
let isDroplistOpen = false;

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
    if (res.status === "true" || res.status === true || res.status == 1) {
        const dataPayload = res.data || res;
        document.getElementById('currentAccountEmail').innerText = dataPayload.email || "Akun Terhubung";
        document.getElementById('balanceDisplay').innerText = rpFormatter.format(dataPayload.saldo || 0);
    } else {
        document.getElementById('balanceDisplay').innerText = "Gagal";
        showToast(res.msg || "Gagal memuat saldo", "error");
    }
}

// ================= MENGUNCI NEGARA KE INDONESIA =================
async function lockCountryToIndonesia() {
    document.getElementById('btnServiceSelectText').innerHTML = `Mencari Server...`;
    const res = await apiCall('getCountries');
    
    if (res.status === "true" || res.status === true || res.status == 1) {
        const dataList = res.data || [];
        let indo = dataList.find(c => {
            let name = c.countryName.toLowerCase();
            return name.includes("indonesia") || name.includes("wakanda") || name.includes("indo");
        });
        
        if (indo) {
            currentCountryId = indo.countryID;
        } else {
            currentCountryId = dataList.length > 0 ? dataList[0].countryID : "1";
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
    document.getElementById('priceDisplayBox').innerText = "...";
    
    currentServiceId = ""; currentServiceName = ""; currentServicePrice = "";
    
    await fetchServices();
}

async function fetchServices() {
    document.getElementById('btnServiceSelectText').innerHTML = `Memuat Harga...`;
    
    const res = currentCategory === "spesial" 
        ? await apiCall('getSpecialServices', `&country_id=${currentCountryId}`) 
        : await apiCall('getServices', `&country_id=${currentCountryId}`);
        
    if (res.status === "true" || res.status === true || res.status == 1) {
        let dataList = res.data || [];
        allServices = dataList.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
        
        let targetSvc = allServices.find(s => s.serviceID === currentServiceId);
        
        if (!targetSvc) {
            targetSvc = allServices.find(s => s.serviceName.toLowerCase().includes("shopee"));
        }
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
        document.getElementById('priceDisplayBox').innerText = "Error";
    }
}

function updateServiceButtonUI() {
    let btnText = document.getElementById('btnServiceSelectText');
    let priceBox = document.getElementById('priceDisplayBox');
    
    let displayPrice = rpFormatter.format(currentServicePrice || 0);
    
    btnText.innerHTML = currentServiceName;
    if (priceBox) priceBox.innerText = displayPrice;
    
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
    if (res.status === "true" || res.status === true || res.status == 1) {
        allOperators = res.data || []; 
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

// ================= PESANAN (ORDER) BARU =================
window.onOrderButtonClicked = async function() {
    const btn = document.getElementById('btnOrder');
    btn.disabled = true; btn.innerText = "MEMPROSES...";
    
    const res = await apiCall('get_order', `&operator_id=${currentOperator}&service_id=${currentServiceId}&country_id=${currentCountryId}`);
    
    // Validasi tangkapan API dengan sangat aman (Bypass bug struktur JSON)
    if (res.status === "true" || res.status === true || res.status == 1) {
        const orderData = res.data || res; // Mengamankan jika server tidak memakai kurung "data":{}
        
        let oId = orderData.order_id || orderData.id;
        let oPhone = orderData.number || orderData.phone || orderData.phone_number;
        let finalPrice = orderData.price || currentServicePrice;
        
        if (oId && oPhone) {
            let opNameDisplay = currentOperator === "random" ? "ACAK" : currentOperator;
            
            activeOrders.unshift({ 
                id: oId, 
                phone: oPhone, 
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
            copyToClipboard(oPhone);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            showToast("Struktur respons API tidak valid dari server.", "error");
        }
    } else {
        showToast(res.msg || "Gagal memesan nomor. Coba lagi.", "error");
    }
    
    btn.disabled = false; btn.innerText = "PESAN NOMOR BARU";
}

function saveActiveOrders() {
    localStorage.setItem('otp_active_orders', JSON.stringify(activeOrders));
}

// ================= KARTU PESANAN (GAYA HERO SMS) =================
function createOrderCard(order) {
    const now = Date.now(); 
    const card = document.createElement("div"); 
    card.className = "order-card"; 
    card.id = `order-card-${order.id}`;
    
    const isSuccess = (order.status === "Recieved" || order.status === "Done" || order.otp);
    
    let opTag = String(order.operatorName).toUpperCase();
    let srvName = String(order.serviceName).toUpperCase();
    const displayPrice = rpFormatter.format(order.price || 0);
    
    let otpHtml = isSuccess 
        ? `<div class="otp-title">KODE OTP</div><div class="otp-code" style="margin:0 !important; letter-spacing: 4px !important;">${order.otp}</div><button class="btn-copy" onclick="copyToClipboard('${order.otp}')" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #000000; color: #ffcc00; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-copy"></i></button>` 
        : `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text" style="font-size:11px; font-weight:800; color:var(--text-secondary); margin-top:8px;">MENUNGGU SMS...</div>`;
        
    let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";
    if (isSuccess) { finishBtnAttr = ""; resendBtnAttr = ""; cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; } 
    else { cancelBtnAttr = ""; replaceBtnAttr = ""; resendBtnAttr = "disabled"; } 
    
    let headerLogoUrl = getOperatorLogo(order.operatorName); 
    let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
    const left = order.expiresAt - now; 
    let timerColor = "#ffffff"; 
    if (left <= 12 * 60000) { timerColor = "var(--danger-color)"; } 
    else if (left <= 18 * 60000) { timerColor = "var(--warning-color)"; }
    
    let m = Math.floor(left/60000); let s = Math.floor((left%60000)/1000);
    let timeStr = left > 0 ? `${m}:${s<10?'0':''}${s}` : '0:00';
    
    card.innerHTML = `
        <div class="order-header">
            <div class="order-info-left" style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 28px; height: 28px; background: #fff; border-radius: 6px; padding: 3px; display: flex; justify-content: center; align-items: center;">
                    <img src="${headerLogoUrl}" onerror="this.src='${fallbackImg}';" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                </div>
                <div>
                    <div class="order-id-label" style="display:inline-block; margin-bottom:2px; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom;">#${order.id} (${srvName} • ${opTag})</div>
                    <div class="order-price" style="display:block;">${displayPrice}</div>
                </div>
            </div>
            <span class="timer" id="timer-${order.id}" style="color: ${timerColor}; font-weight: 900;">${isSuccess ? 'SELESAI' : timeStr}</span>
        </div>
        <div class="phone-row">
            <span class="phone-number">${formatPhoneNumber(order.phone)}</span>
            <button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button>
        </div>
        <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div>
        <div class="action-buttons-grid">
            <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}')" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button>
            <button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button>
            <button class="btn-danger" id="btn-cancel-${order.id}" onclick="setOrderStatus('${order.id}', 2)" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button>
            <button class="btn-success" id="btn-finish-${order.id}" onclick="setOrderStatus('${order.id}', 4)" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button>
        </div>
    `;
    return card;
}

function renderOrders() {
    const container = document.getElementById('activeOrdersContainer');
    if (!container) return;
    
    if (activeOrders.length === 0) { 
        container.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; 
        isDroplistOpen = false; 
        return; 
    }
    
    container.innerHTML = "";
    container.appendChild(createOrderCard(activeOrders[0]));

    if (activeOrders.length > 1) {
        const oldOrdersCount = activeOrders.length - 1;
        const wrapper = document.createElement("div"); wrapper.className = "old-orders-wrapper";
        const btnToggle = document.createElement("button"); btnToggle.className = `btn-droplist ${isDroplistOpen ? 'open' : ''}`; 
        btnToggle.innerHTML = `<span><i class="fas fa-history"></i> Lihat ${oldOrdersCount} Pesanan Lama</span> <i class="fas fa-chevron-${isDroplistOpen ? 'up' : 'down'}"></i>`; 
        btnToggle.onclick = () => { isDroplistOpen = !isDroplistOpen; renderOrders(); };
        wrapper.appendChild(btnToggle);
        
        const content = document.createElement("div"); content.className = `old-orders-content ${isDroplistOpen ? 'show' : ''}`;
        
        const btnCancelAll = document.createElement("button"); btnCancelAll.className = "btn-cancel-all"; btnCancelAll.id = "btn-cancel-all-old";
        btnCancelAll.innerHTML = `<i class="fas fa-trash-alt"></i> Batalkan Semua Pesanan Lama`; 
        btnCancelAll.onclick = cancelAllOldOrders;
        content.appendChild(btnCancelAll);

        for (let i = 1; i < activeOrders.length; i++) { 
            content.appendChild(createOrderCard(activeOrders[i])); 
        }
        wrapper.appendChild(content); 
        container.appendChild(wrapper);
    }
}

// ================= AKSI TOMBOL (BATAL, SELESAI, GANTI, ULANG) =================
window.setOrderStatus = async function(orderId, statusCode) {
    // statusCode: 2 = Cancel, 4 = Finish
    const btnId = statusCode === 2 ? `btn-cancel-${orderId}` : `btn-finish-${orderId}`;
    const btn = document.getElementById(btnId);
    if(btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }

    const res = await apiCall('set_status', `&order_id=${orderId}&status=${statusCode}`);
    
    if (res.status === "true" || res.status === true || res.status == 1 || (res.msg && res.msg.toLowerCase() === "success")) {
        let oIdx = activeOrders.findIndex(x => String(x.id) === String(orderId));
        if (oIdx !== -1) {
            let orderToSave = activeOrders[oIdx];
            if (statusCode === 2) saveToHistory(orderToSave, "BATAL");
            if (statusCode === 4) saveToHistory(orderToSave, "SELESAI");
            
            const card = document.getElementById(`order-card-${orderId}`);
            if (card) card.classList.add('removing');
            
            setTimeout(() => {
                activeOrders.splice(oIdx, 1);
                saveActiveOrders();
                fetchBalance();
                if (statusCode === 2) showToast("Pesanan Dibatalkan");
                if (statusCode === 4) showToast("Pesanan Selesai");
                renderOrders();
            }, 300);
        }
    } else {
        showToast(res.msg || "Gagal mengubah status", "error");
        renderOrders(); 
    }
}

window.resendSpecificOrder = async function(id) {
    const btnResend = document.getElementById(`btn-resend-${id}`);
    if(btnResend) { btnResend.disabled = true; btnResend.innerHTML = '<div class="loader"></div>'; }
    
    const res = await apiCall('set_status', `&order_id=${id}&status=3`); // 3 = Resend SMS
    if (res.status === "true" || res.status === true || res.status == 1 || (res.msg && res.msg.toLowerCase() === "success")) {
        showToast("Meminta kode SMS baru...");
        let idx = activeOrders.findIndex(o => String(o.id) === String(id));
        if (idx !== -1) {
            saveToHistory(activeOrders[idx], "MINTA ULANG");
            activeOrders[idx].status = "Waiting SMS";
            activeOrders[idx].otp = null;
            saveActiveOrders();
        }
    } else {
        showToast("Gagal resend: " + (res.msg || "Error"), "error");
    }
    renderOrders();
}

window.replaceSpecificOrder = async function(id) {
    const btnReplace = document.getElementById(`btn-replace-${id}`);
    if(btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = '<div class="loader"></div>'; }
    
    const oldOrder = activeOrders.find(o => String(o.id) === String(id));
    if (!oldOrder) return;

    // Batalkan yang lama
    await apiCall('set_status', `&order_id=${id}&status=2`);
    saveToHistory(oldOrder, "GANTI");
    activeOrders = activeOrders.filter(o => String(o.id) !== String(id));
    
    showToast("Mencari nomor pengganti...");
    
    // Pesan yang baru
    let opCode = oldOrder.operatorName === "ACAK" ? "random" : oldOrder.operatorName.toLowerCase();
    const res = await apiCall('get_order', `&operator_id=${opCode}&service_id=${currentServiceId}&country_id=${currentCountryId}`);
    
    if (res.status === "true" || res.status === true || res.status == 1) {
        const orderData = res.data || res;
        let oId = orderData.order_id || orderData.id;
        let oPhone = orderData.number || orderData.phone || orderData.phone_number;
        let finalPrice = orderData.price || currentServicePrice;
        
        if (oId && oPhone) {
            activeOrders.unshift({ 
                id: oId, 
                phone: oPhone, 
                serviceName: currentServiceName,
                operatorName: oldOrder.operatorName,
                price: finalPrice, 
                otp: null, 
                status: "Waiting SMS", 
                expiresAt: Date.now() + (20 * 60 * 1000)
            });
            copyToClipboard(oPhone);
            showToast("Berhasil mendapat nomor baru!");
        }
    } else {
        showToast("Gagal mencari ganti: " + (res.msg || "Stok Kosong"), "error");
    }
    
    saveActiveOrders();
    fetchBalance();
    renderOrders();
}

window.cancelAllOldOrders = async function() {
    if (activeOrders.length <= 1) return;
    const oldOrders = activeOrders.slice(1);
    
    const btnAll = document.getElementById("btn-cancel-all-old");
    if(btnAll) { btnAll.disabled = true; btnAll.innerHTML = '<div class="loader" style="border-top-color:var(--danger-color);"></div>'; }
    showToast(`Membatalkan ${oldOrders.length} pesanan lama...`, "warning");
    
    let cancelledCount = 0;
    for (const order of oldOrders) {
        try {
            const res = await apiCall('set_status', `&order_id=${order.id}&status=2`);
            if (res.status === "true" || res.status === true || res.status == 1 || (res.msg && res.msg.toLowerCase() === "success")) {
                saveToHistory(order, "BATAL"); 
                activeOrders = activeOrders.filter(o => String(o.id) !== String(order.id));
                cancelledCount++;
            }
        } catch(e) {}
    }
    saveActiveOrders();
    fetchBalance();
    if (cancelledCount > 0) showToast(`${cancelledCount} pesanan lama dibatalkan.`, "success");
    if (activeOrders.length <= 1) isDroplistOpen = false;
    renderOrders();
};

// ================= POLLING STATUS =================
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        let needsRender = false;
        const now = Date.now();
        
        for (let i = activeOrders.length - 1; i >= 0; i--) {
            let o = activeOrders[i];
            
            // Hapus otomatis jika waktu habis (20 menit)
            if (now > o.expiresAt && o.status !== "Recieved" && o.status !== "Done") {
                activeOrders.splice(i, 1);
                needsRender = true;
                continue;
            }

            if (o.status !== "Recieved" && o.status !== "Done") {
                const res = await apiCall('get_status', `&order_id=${o.id}`);
                
                if (res.status === "true" || res.status === true || res.status == 1) {
                    const stData = res.data || res;
                    const apiStatus = stData.status || "";
                    const sLower = String(apiStatus).toLowerCase();
                    
                    if (sLower.includes("recieved") || sLower.includes("received") || sLower.includes("done")) {
                        notifSound.play().catch(e=>{});
                        o.status = "Recieved";
                        let textSms = stData.sms || "OTP DITERIMA";
                        let extracted = textSms.match(/\b\d{4,8}\b/);
                        o.otp = extracted ? extracted[0] : textSms;
                        needsRender = true;
                    } else if (sLower.includes("cancel") || sLower.includes("failed")) {
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
            renderOrders(); // Refresh hitungan waktu (Timer)
        }
    }, 4000); 
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
