const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

// ==========================================
// 0. KONFIGURASI FIREBASE PRESENCE (DETEKSI ONLINE)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0",
    authDomain: "catatanku-app-ce60b.firebaseapp.com",
    databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "catatanku-app-ce60b",
    storageBucket: "catatanku-app-ce60b.firebasestorage.app",
    messagingSenderId: "291744292263",
    appId: "1:291744292263:web:ab8d32ba52bc19cbffea82"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let viewingPresenceRef = null;
let activeAccountName = null;
let activeOrders = [];
let availableProducts = []; 
let selectedProductId = null;
let timerInterval = null;
let pollingInterval = null;

// DOM Elements
const currentAccountName = document.getElementById('currentAccountName');
const productList = document.getElementById('productList');
const btnOrder = document.getElementById('btnOrder');
const activeOrdersContainer = document.getElementById('activeOrdersContainer');
const activeCount = document.getElementById('activeCount');
const balanceDisplay = document.getElementById('balanceDisplay');
const exitModal = document.getElementById('exitModal');
const btnOpenNotes = document.getElementById('btnOpenNotes');

// ==========================================
// 1. TOMBOL CATATAN (REDIRECT KE FOLDER)
// ==========================================
if (btnOpenNotes) {
    btnOpenNotes.onclick = () => {
        window.location.href = "notes/notes.html";
    };
}

// ==========================================
// 2. SISTEM BACK BUTTON
// ==========================================
let isExitModalOpen = false;

window.addEventListener('popstate', (e) => {
    if (isExitModalOpen) { 
        closeExitModal(); history.pushState(null, null, window.location.href); 
    } else { 
        exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); 
    }
});

function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() { setAccountViewingStatus(false); window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }

// ==========================================
// 3. AUTO LOGIN, DROPDOWN AKUN & PRESENCE
// ==========================================
function setAccountViewingStatus(isViewing) {
    if (!activeAccountName) return;
    if (isViewing) {
        const connectedRef = db.ref('.info/connected');
        viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`);
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); }
        });
    } else {
        if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); }
    }
}

function updateAccountOrdersStatus() {
    if (!activeAccountName) return;
    db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0);
}

async function fetchAccounts() {
    try {
        const res = await fetch(`${BASE_URL}/api/accounts`);
        const data = await res.json();
        const accountSwitcher = document.getElementById('accountSwitcher');
        
        if (data.accounts && data.accounts.length > 0) {
            if (accountSwitcher) {
                accountSwitcher.innerHTML = '';
                let hasNomor01 = false;
                
                data.accounts.forEach(acc => {
                    const opt = document.createElement('option');
                    opt.value = acc;
                    opt.innerText = `👤 ${acc}`;
                    if (acc === 'nomor_01') hasNomor01 = true;
                    accountSwitcher.appendChild(opt);
                });
                
                let defaultAcc = hasNomor01 ? 'nomor_01' : data.accounts[0];
                accountSwitcher.value = defaultAcc;
                loginAccount(defaultAcc);
            } else {
                loginAccount(data.accounts[0]);
            }
        } else {
            if(currentAccountName) currentAccountName.innerText = "Tidak ada akun";
            showToast("Tidak ada akun di Server", "error");
        }
    } catch (error) {
        if(currentAccountName) currentAccountName.innerText = "Error Koneksi";
        showToast("Gagal terhubung ke Server", "error");
    }
}

window.switchAccount = function(accountName) {
    if (activeAccountName === accountName) return;
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    setAccountViewingStatus(false);
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Memuat pesanan...</div>';
    if (balanceDisplay) balanceDisplay.innerText = "...";
    loginAccount(accountName);
};

function loginAccount(accountName) {
    activeAccountName = accountName;
    if (currentAccountName) currentAccountName.innerText = accountName;
    setAccountViewingStatus(true);

    const now = Date.now();
    const rawOrders = JSON.parse(localStorage.getItem(`orders_${accountName}`)) || [];
    activeOrders = rawOrders.filter(o => o.expiresAt > now);
    if (rawOrders.length !== activeOrders.length) saveToStorage();
    initMainApp();
}

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { method: method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

function saveToStorage() { localStorage.setItem(`orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }

function showToast(pesan, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerHTML = pesan;
    if (type === "error") { toast.style.backgroundColor = "#ef4444"; toast.style.color = "#ffffff"; toast.style.boxShadow = "0 4px 12px rgba(239, 68, 68, 0.4)"; } 
    else { toast.style.backgroundColor = "#1f2937"; toast.style.color = "#ffffff"; toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)"; }
    toast.classList.add("show"); setTimeout(() => { toast.classList.remove("show"); }, 3000);
}

function copyToClipboard(text) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(text); }); } else { copyFallback(text); } }
function copyFallback(text) { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } document.body.removeChild(ta); }

// ==========================================
// 4. LOAD SERVER & AUTO SELECT HARGA TERMURAH
// ==========================================
async function fetchBalance() {
    try {
        const res = await apiCall('/balance');
        if (res.success) { const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }); if (balanceDisplay) balanceDisplay.innerText = formatter.format(res.data.balance); }
    } catch (error) { if (balanceDisplay) balanceDisplay.innerText = "Error"; }
}

async function loadShopeeIndonesia() {
    try {
        if (productList) productList.innerHTML = '<div class="status-text">Mencari Server...</div>';
        const countriesRes = await apiCall('/catalog/countries');
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            availableProducts = productsRes.data.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, 3);
            if (productList) productList.innerHTML = ""; 
            if (availableProducts.length > 0) { selectedProductId = availableProducts[0].id; if (btnOrder) btnOrder.disabled = false; }
            availableProducts.forEach(product => {
                const card = document.createElement("div"); card.className = "product-card";
                if (selectedProductId === product.id) { card.classList.add('selected'); }
                card.innerHTML = `<div class="product-info"><h4>Server ID: ${product.id}</h4><p>Stok: ${product.available}</p></div><div class="product-price">Rp ${product.price}</div>`;
                card.onclick = () => { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); selectedProductId = product.id; if (btnOrder) btnOrder.disabled = false; };
                if (productList) productList.appendChild(card);
            });
        }
    } catch (error) { if (productList) productList.innerHTML = `<div class="status-text" style="color:red;">Error: ${error.message}</div>`; }
}

// ==========================================
// 5. PESAN BARU & PEMBUATAN TOMBOL SALIN SANDI
// ==========================================
if (btnOrder) {
    const btnCopyPassword = document.createElement('button');
    btnCopyPassword.id = 'btnCopyPassword'; btnCopyPassword.innerHTML = '<i class="fas fa-copy"></i> Salin Sandi';
    btnCopyPassword.style.width = "100%"; btnCopyPassword.style.padding = "12px"; btnCopyPassword.style.marginTop = "10px"; btnCopyPassword.style.backgroundColor = "#4a4a4a"; btnCopyPassword.style.color = "white"; btnCopyPassword.style.border = "none"; btnCopyPassword.style.borderRadius = "8px"; btnCopyPassword.style.fontWeight = "bold"; btnCopyPassword.style.fontSize = "16px"; btnCopyPassword.style.cursor = "pointer"; btnCopyPassword.style.transition = "0.3s";
    btnCopyPassword.onmousedown = () => btnCopyPassword.style.opacity = "0.8"; btnCopyPassword.onmouseup = () => btnCopyPassword.style.opacity = "1";
    btnCopyPassword.onclick = () => { copyToClipboard("Aku123.."); };
    btnOrder.parentNode.insertBefore(btnCopyPassword, btnOrder.nextSibling);

    btnOrder.onclick = async () => {
        if (!selectedProductId) return;
        btnOrder.disabled = true; const originalText = btnOrder.innerText; btnOrder.innerText = "Memproses...";
        try {
            const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(selectedProductId), quantity: 1 });
            if (res.success) {
                const orderData = res.data.orders[0]; const productInfo = availableProducts.find(p => String(p.id) === String(selectedProductId));
                const expiresAtMs = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000);
                const createdAtMs = orderData.created_at ? new Date(orderData.created_at).getTime() : Date.now();
                activeOrders.unshift({ id: orderData.id, productId: parseInt(selectedProductId), phone: orderData.phone_number, price: orderData.price || orderData.cost || orderData.amount || (productInfo ? productInfo.price : 0), otp: null, status: "ACTIVE", expiresAt: expiresAtMs, cancelUnlockTime: createdAtMs + (120 * 1000), isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(orderData.phone_number);
            } else { showToast(`Gagal: ${res.error.message}`, "error"); }
        } catch (error) { showToast("Kesalahan jaringan.", "error"); }
        btnOrder.innerText = originalText; btnOrder.disabled = false;
    };
}

// ==========================================
// 6. HELPER UNTUK FORMAT TAMPILAN NOMOR & OTP
// ==========================================
function formatPhoneNumber(phone) {
    if (!phone) return "";
    return String(phone).replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function formatOTP(otp) {
    if (!otp) return "";
    const cleaned = String(otp).trim();
    if (cleaned.length === 6) {
        return cleaned.substring(0, 3) + "&nbsp;&nbsp;" + cleaned.substring(3, 6);
    }
    return cleaned;
}

// ==========================================
// 7. RENDER KARTU & POSISI TOMBOL BARU
// ==========================================
function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    const now = Date.now();

    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`; 
        let isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        let otpHtml = isSuccess ? `<div class="otp-code">${formatOTP(order.otp)}</div>` : `<div class="modern-loader"><span></span><span></span><span></span></div><div class="waiting-text">MENUNGGU SMS</div>`;
        const passProductId = order.productId ? `'${order.productId}'` : 'null';

        const wait = order.cancelUnlockTime - now;
        let cancelBtnAttr = ""; let cancelBtnText = "Batalkan"; let actionBtnAttr = ""; let replaceBtnText = '<i class="fas fa-sync-alt"></i> Ganti'; let resendBtnText = '<i class="fas fa-envelope"></i> Ulang'; let finishBtnAttr = "disabled";
        if (isSuccess) { cancelBtnAttr = "disabled"; cancelBtnText = "Sukses"; actionBtnAttr = "disabled"; replaceBtnText = '<i class="fas fa-check"></i>'; resendBtnText = '<i class="fas fa-check"></i>'; finishBtnAttr = ""; } 
        else if (wait > 0 && !order.isAutoCanceling) { const sec = Math.ceil(wait / 1000); cancelBtnAttr = "disabled"; cancelBtnText = `Tunggu ${sec}s`; actionBtnAttr = "disabled"; replaceBtnText = `${sec}s`; resendBtnText = `${sec}s`; } 
        else if (order.isAutoCanceling) { cancelBtnAttr = "disabled"; cancelBtnText = "Memproses..."; actionBtnAttr = "disabled"; }

        const displayPrice = (order.price && order.price != 0) ? `Rp ${order.price}` : 'Rp -';

        card.innerHTML = `
            <div class="order-header"><div><span class="order-id-label">#${order.id}</span> <span class="order-price">${displayPrice}</span></div><span class="timer" id="timer-${order.id}">--:--</span></div>
            <div class="phone-row"><span class="phone-number">${formatPhoneNumber(order.phone)}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button></div>
            <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${isSuccess ? '<div class="otp-title">KODE OTP</div>' : ''}${otpHtml}</div>
            <div class="action-buttons-grid">
                <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder(${order.id}, ${passProductId})" ${actionBtnAttr}>${replaceBtnText}</button>
                <button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder(${order.id})" disabled title="Fitur ini dinonaktifkan sementara">${resendBtnText}</button>
                <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder(${order.id})" ${cancelBtnAttr}>${cancelBtnText}</button>
                <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder(${order.id})" ${finishBtnAttr}>Selesai</button>
            </div>
        `;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

// ==========================================
// 8. TIMER & AUTO BATAL (10 Menit)
// ==========================================
function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now; const timerElement = document.getElementById(`timer-${order.id}`);
            if (timeLeft <= 0) { activeOrders.splice(index, 1); saveToStorage(); fetchBalance(); return; }
            if (timerElement) { const m = Math.floor((timeLeft / 1000 / 60) % 60); const s = Math.floor((timeLeft / 1000) % 60); timerElement.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`; }

            if (timeLeft <= 600000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) { order.isAutoCanceling = true; cancelSpecificOrder(order.id, true); }

            const btnCancel = document.getElementById(`btn-cancel-${order.id}`); const btnReplace = document.getElementById(`btn-replace-${order.id}`); const btnResend = document.getElementById(`btn-resend-${order.id}`); const btnFinish = document.getElementById(`btn-finish-${order.id}`);
            
            if (order.status === "OTP_RECEIVED") {
                if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Sukses"; }
                if (btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = '<i class="fas fa-check"></i>'; }
                if (btnResend) { btnResend.disabled = true; btnResend.innerHTML = '<i class="fas fa-check"></i>'; }
                if (btnFinish) btnFinish.disabled = false;
            } else {
                const wait = order.cancelUnlockTime - now;
                if (wait > 0) {
                    const sec = Math.ceil(wait/1000);
                    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = `Tunggu ${sec}s`; }
                    if (btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = `${sec}s`; }
                    if (btnResend) { btnResend.disabled = true; btnResend.innerHTML = `${sec}s`; }
                } else if (!order.isAutoCanceling) {
                    if (btnCancel) { btnCancel.disabled = false; btnCancel.innerText = "Batalkan"; }
                    if (btnReplace) { btnReplace.disabled = false; btnReplace.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; }
                    // if (btnResend && !btnResend.innerHTML.includes('loader')) { btnResend.disabled = false; btnResend.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; }
                }
            }
        });
        if (activeOrders.length === 0) clearInterval(timerInterval);
    }, 1000);

    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) { clearInterval(pollingInterval); return; }
        for (let i = 0; i < activeOrders.length; i++) {
            let order = activeOrders[i]; if (order.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/orders/${order.id}`);
                if (res.success) {
                    if (res.data.status === "OTP_RECEIVED") { activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.otp_code; saveToStorage(); } 
                    else if (res.data.status !== "ACTIVE" && res.data.status !== "PENDING") { activeOrders = activeOrders.filter(o => o.id !== order.id); saveToStorage(); fetchBalance(); }
                }
            } catch (e) {}
        }
    }, 3000);
}

// ==========================================
// 9. SYNC DATA SERVER
// ==========================================
async function syncServerOrders() {
    try {
        const res = await apiCall('/orders'); 
        if (res.success && res.data) {
            let serverOrders = Array.isArray(res.data) ? res.data : (res.data.data || []);
            serverOrders = serverOrders.filter(o => o.status === 'ACTIVE' || o.status === 'OTP_RECEIVED' || o.status === 'PENDING');
            serverOrders.forEach(order => {
                if (!activeOrders.find(o => o.id === order.id)) {
                    let syncedPrice = order.price || order.cost || order.amount || 0;
                    if (syncedPrice == 0 && order.product_id && availableProducts.length > 0) { const matchProduct = availableProducts.find(p => String(p.id) === String(order.product_id)); if (matchProduct) syncedPrice = matchProduct.price; }
                    const exp = order.expires_at ? new Date(order.expires_at).getTime() : Date.now() + (20*60*1000);
                    const cTime = order.created_at ? new Date(order.created_at).getTime() : (exp - (20*60*1000));
                    activeOrders.unshift({ id: order.id, productId: order.product_id || order.service_id, phone: order.phone_number || order.phone, price: syncedPrice, otp: order.otp_code, status: order.status, expiresAt: exp, cancelUnlockTime: cTime + (120*1000), isAutoCanceling: false });
                }
            });
            saveToStorage(); startPollingAndTimer(); fetchBalance();
        }
    } catch (e) {}
}

// ==========================================
// 10. AKSI TOMBOL (REPLACE, RESEND, CANCEL, FINISH)
// ==========================================
window.replaceSpecificOrder = async function(orderId, productId) {
    const btn = document.getElementById(`btn-replace-${orderId}`);
    if (!productId || productId === 'null') return showToast("Pilih server manual.", "error");
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const c = await apiCall('/orders/cancel', 'POST', { id: orderId });
        if (c.success || (c.error && c.error.code === 'NOT_FOUND')) {
            activeOrders = activeOrders.filter(o => o.id !== orderId);
            const n = await apiCall('/orders/create', 'POST', { product_id: parseInt(productId), quantity: 1 });
            if (n.success) {
                const od = n.data.orders[0]; const pInfo = availableProducts.find(p => String(p.id) === String(productId)); const finalPrice = od.price || od.cost || (pInfo ? pInfo.price : 0);
                activeOrders.unshift({ id: od.id, productId: parseInt(productId), phone: od.phone_number, price: finalPrice, otp: null, status: "ACTIVE", expiresAt: new Date(od.expires_at).getTime(), cancelUnlockTime: Date.now() + (120*1000), isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(od.phone_number); showToast("Nomor diganti!");
            } else { saveToStorage(); fetchBalance(); showToast("Gagal pesan baru.", "error"); }
        } else { showToast("Gagal batal lama.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
    } catch (e) { showToast("Error Jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

window.resendSpecificOrder = async function(orderId) {
    const btn = document.getElementById(`btn-resend-${orderId}`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const res = await apiCall('/orders/resend', 'POST', { id: orderId });
        if (res.success) { showToast("Meminta ulang SMS..."); setTimeout(() => { const currentBtn = document.getElementById(`btn-resend-${orderId}`); if(currentBtn && !currentBtn.innerHTML.includes('fa-check')) { currentBtn.disabled = false; currentBtn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }, 30000); } 
        else { showToast(res.error ? res.error.message : "Gagal meminta ulang.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
    } catch (e) { showToast("Kesalahan jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

window.cancelSpecificOrder = async function(id, auto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${id}`);
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Memproses..."; }
    try { const res = await apiCall('/orders/cancel', 'POST', { id: id }); if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { activeOrders = activeOrders.filter(o => o.id !== id); saveToStorage(); fetchBalance(); if(auto) showToast("Otomatis batal (waktu sisa 10 menit)", "error"); } else { showToast("Gagal dibatalkan.", "error"); if (btnCancel) btnCancel.disabled = false; } } catch (e) { if (btnCancel) btnCancel.disabled = false; }
};

window.finishSpecificOrder = async function(id) {
    const btnFinish = document.getElementById(`btn-finish-${id}`); if (btnFinish) { btnFinish.disabled = true; btnFinish.innerText = "Menutup..."; }
    try { await apiCall('/orders/finish', 'POST', { id: id }); } catch (e) {} activeOrders = activeOrders.filter(o => o.id !== id); saveToStorage();
};

async function initMainApp() {
    if (balanceDisplay) balanceDisplay.innerText = "...";
    await loadShopeeIndonesia(); renderOrders();
    if (activeOrders.length > 0) startPollingAndTimer(); syncServerOrders();
}

window.onload = () => {
    setAccountViewingStatus(false); history.pushState(null, null, window.location.href);
    fetchAccounts(); 
};
