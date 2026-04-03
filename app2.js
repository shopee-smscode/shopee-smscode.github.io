const BASE_URL = "https://hero-sms-proxy.namakamu.workers.dev"; // [!] GANTI DENGAN URL WORKER ANDA

// ==========================================
// 0. KONFIGURASI FIREBASE CATATANKU
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
const DB_PATH = 'notes/public';

// Variabel Global
let selectedNoteKey = null, isEditingNote = false, currentNoteRawContent = "";
let viewingPresenceRef = null, isPresenceListenerAttached = false;
let activeAccountName = null, activeOrders = [], availableProducts = [], selectedProductId = null, timerInterval = null, pollingInterval = null;

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

// DOM Elements
const accountView = document.getElementById('accountView'), 
      appView = document.getElementById('appView'), 
      accountListContainer = document.getElementById('accountListContainer'), 
      btnSwitchAccount = document.getElementById('btnSwitchAccount'), 
      currentAccountName = document.getElementById('currentAccountName'), 
      productList = document.getElementById('productList'), 
      btnOrder = document.getElementById('btnOrder'), 
      activeOrdersContainer = document.getElementById('activeOrdersContainer'), 
      activeCount = document.getElementById('activeCount'), 
      balanceDisplay = document.getElementById('balanceDisplay'), 
      exitModal = document.getElementById('exitModal'), 
      notesListModal = document.getElementById('notesListModal'), 
      noteFormModal = document.getElementById('noteFormModal'), 
      noteDetailModal = document.getElementById('noteDetailModal'), 
      notesCountDisplay = document.getElementById('notesCount');

// ==========================================
// 1. SISTEM UTILS & STORAGE
// ==========================================
async function apiCall(endpoint, method = "GET", body = null) {
    const options = { method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

function saveToStorage() { 
    localStorage.setItem(`hero_orders_${activeAccountName}`, JSON.stringify(activeOrders)); 
    renderOrders(); 
}

function showToast(p) { 
    const t = document.getElementById("toast"); 
    if(t) { t.innerText = p; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 2500); }
}

function copyToClipboard(t) { 
    navigator.clipboard.writeText(t).then(()=>showToast("Berhasil disalin!")).catch(() => {
        const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast("Berhasil disalin!");
    });
}

// ==========================================
// 2. RENDER KARTU (TEKS STATIS, LOGIKA LOCK 2 MENIT)
// ==========================================
function renderOrders() {
    activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { 
        activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; 
        return; 
    }
    activeOrdersContainer.innerHTML = "";
    const now = Date.now();

    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`;
        const isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        const displayPrice = (order.price && order.price != 0) ? usdFormatter.format(order.price) : '$ -';
        
        // Logika Hitungan Mundur 2 Menit (Lock tombol di background)
        const wait = order.cancelUnlockTime - now; 
        
        let cancelBtnAttr = ""; let cancelBtnText = "Batalkan"; 
        let actionBtnAttr = ""; let replaceBtnText = '<i class="fas fa-sync-alt"></i> Ganti'; let resendBtnText = '<i class="fas fa-envelope"></i> Ulang'; 
        let finishBtnAttr = "disabled";

        if (isSuccess) { 
            cancelBtnAttr = "disabled"; cancelBtnText = "Sukses"; 
            actionBtnAttr = "disabled"; replaceBtnText = '<i class="fas fa-check"></i>'; resendBtnText = '<i class="fas fa-check"></i>'; 
            finishBtnAttr = ""; 
        } else if (wait > 0) {
            // TOMBOL DISABLE TAPI TEKS TETAP STATIS (TANPA ANGKA)
            cancelBtnAttr = "disabled"; 
            actionBtnAttr = "disabled"; 
        }

        card.innerHTML = `
            <div class="order-header"><div><span class="order-id-label">#${order.id}</span> <span class="order-price">${displayPrice}</span></div><span class="timer" id="timer-${order.id}">--:--</span></div>
            <div class="phone-row"><span class="phone-number">${order.phone}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button></div>
            <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${isSuccess ? '<div class="otp-title">KODE OTP</div><div class="otp-code">'+order.otp+'</div>' : '<div class="modern-loader"><span></span><span></span><span></span></div><div class="waiting-text">MENUNGGU SMS</div>'}</div>
            <div class="action-buttons-grid">
                <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}', 'ka')" ${actionBtnAttr}>${replaceBtnText}</button>
                <button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${actionBtnAttr}>${resendBtnText}</button>
                <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}>${cancelBtnText}</button>
                <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}>Selesai</button>
            </div>`;
        activeOrdersContainer.appendChild(card);
    });
}

// ==========================================
// 3. TIMER & POLLING
// ==========================================
function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((o, i) => {
            const left = o.expiresAt - now;
            const el = document.getElementById(`timer-${o.id}`);
            if (left <= 0) { activeOrders.splice(i, 1); saveToStorage(); fetchBalance(); return; }
            if (el) { const m = Math.floor(left/60000), s = Math.floor((left%60000)/1000); el.innerText = `${m}:${s<10?'0':''}${s}`; }

            // Buka kunci tombol jika sudah 2 menit
            const wait = o.cancelUnlockTime - now;
            const btnCancel = document.getElementById(`btn-cancel-${o.id}`); 
            const btnReplace = document.getElementById(`btn-replace-${o.id}`); 
            const btnResend = document.getElementById(`btn-resend-${o.id}`); 

            if (o.status !== "OTP_RECEIVED") {
                if (wait <= 0) {
                    if (btnCancel && btnCancel.innerText !== "Memproses...") btnCancel.disabled = false;
                    if (btnReplace && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false;
                    if (btnResend && !btnResend.innerHTML.includes('loader')) btnResend.disabled = false;
                }
            }
        });
    }, 1000);
    
    if (!pollingInterval) pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) return;
        activeOrders.forEach(async (o, i) => {
            if (o.status === "OTP_RECEIVED") return;
            try {
                const res = await apiCall(`/orders/${o.id}`);
                if (res.success && res.data.status === "OTP_RECEIVED") { activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.otp_code; saveToStorage(); }
                else if (res.success && res.data.status === "CANCELLED") { activeOrders = activeOrders.filter(ord => String(ord.id) !== String(o.id)); saveToStorage(); fetchBalance(); }
            } catch(e) {}
        });
    }, 5000);
}

// ==========================================
// 4. AKSI TOMBOL HERO-SMS
// ==========================================
btnOrder.onclick = async () => {
    btnOrder.disabled = true; btnOrder.innerText = "Memproses...";
    try {
        const res = await apiCall('/orders/create', 'POST');
        if (res.success) {
            const o = res.data.orders[0];
            activeOrders.unshift({ 
                id: o.id, productId: 'ka', phone: o.phone_number, 
                price: availableProducts[0]?.price || 0, otp: null, status: "ACTIVE", 
                expiresAt: Date.now() + (20 * 60 * 1000), 
                cancelUnlockTime: Date.now() + 120000, // Lock 2 Menit
                isAutoCanceling: false 
            });
            saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(o.phone_number);
        } else { showToast(res.error.message); }
    } catch (e) { showToast("Gagal terhubung."); }
    btnOrder.disabled = false; btnOrder.innerText = "Pesan Nomor Baru";
};

window.replaceSpecificOrder = async function(orderId, productId) {
    const idStr = String(orderId); const btn = document.getElementById(`btn-replace-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        await apiCall('/orders/cancel', 'POST', { id: idStr });
        activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
        const n = await apiCall('/orders/create', 'POST', { product_id: 'ka', quantity: 1 });
        if (n.success) {
            const od = n.data.orders[0];
            activeOrders.unshift({ id: od.id, productId: 'ka', phone: od.phone_number, price: availableProducts[0].price, otp: null, status: "ACTIVE", expiresAt: Date.now() + (20 * 60 * 1000), cancelUnlockTime: Date.now() + 120000, isAutoCanceling: false });
            saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(od.phone_number); showToast("Nomor diganti!");
        } else { saveToStorage(); fetchBalance(); showToast("Gagal pesan baru."); }
    } catch (e) { showToast("Error."); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

window.cancelSpecificOrder = async function(id) {
    const idStr = String(id); const btnCancel = document.getElementById(`btn-cancel-${idStr}`); 
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Memproses..."; }
    try { 
        await apiCall('/orders/cancel', 'POST', { id: idStr }); 
        activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
        saveToStorage(); fetchBalance();
    } catch (e) { if (btnCancel) btnCancel.disabled = false; }
};

window.finishSpecificOrder = async function(id) {
    const idStr = String(id); const btnFinish = document.getElementById(`btn-finish-${idStr}`); 
    if (btnFinish) { btnFinish.disabled = true; btnFinish.innerText = "Menutup..."; }
    try { await apiCall('/orders/finish', 'POST', { id: idStr }); } catch (e) {} 
    activeOrders = activeOrders.filter(o => String(o.id) !== idStr); saveToStorage();
};

window.resendSpecificOrder = async function(id) {
    const idStr = String(id); const btn = document.getElementById(`btn-resend-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try { 
        const res = await apiCall('/orders/resend', 'POST', { id: idStr }); 
        if (res.success) showToast("Permintaan ulang dikirim."); 
        setTimeout(() => { if (btn && !btn.innerHTML.includes('fa-check')) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }, 5000);
    } catch (e) { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

// ==========================================
// 5. SISTEM LOGIN & PRESENCE
// ==========================================
async function fetchBalance() { try { const res = await apiCall('/balance'); if (res.success) balanceDisplay.innerText = usdFormatter.format(res.data.balance); } catch (e) {} }
async function loadShopeeIndonesia() {
    try {
        productList.innerHTML = '<div class="status-text">Memuat harga...</div>';
        const productsRes = await apiCall(`/catalog/products`);
        if (productsRes.success && productsRes.data.length > 0) {
            availableProducts = productsRes.data; productList.innerHTML = "";
            selectedProductId = availableProducts[0].id; btnOrder.disabled = false;
            availableProducts.forEach(product => {
                const card = document.createElement("div"); card.className = "product-card selected";
                card.innerHTML = `<div class="product-info"><h4>Server ID: ${product.id}</h4><p>Stok: ${product.available}</p></div><div class="product-price">${usdFormatter.format(product.price)}</div>`;
                productList.appendChild(card);
            });
        }
    } catch (e) { productList.innerHTML = '<div class="status-text">Error muat data.</div>'; }
}

function loginAccount(n) { 
    activeAccountName = n; 
    sessionStorage.setItem('hero_savedAccountName', n); 
    appView.classList.remove('hidden'); accountView.classList.add('hidden'); currentAccountName.innerText = n; 
    const rawOrders = JSON.parse(localStorage.getItem(`hero_orders_${n}`)) || []; 
    activeOrders = rawOrders.filter(o => o.expiresAt > Date.now()); 
    saveToStorage(); initMainApp(); 
}

async function fetchAccounts() { 
    const res = await fetch(`${BASE_URL}/api/accounts`); 
    const d = await res.json(); 
    accountListContainer.innerHTML = ""; 
    d.accounts.forEach(a => { 
        const c = document.createElement('div'); c.className="account-card"; 
        c.innerHTML=`<div class="account-info-wrapper"><div class="account-avatar">${a.charAt(0).toUpperCase()}</div><div class="account-details"><span class="account-name">${a}</span><span id="status-${a.replace(/[^a-zA-Z0-9]/g, '-')}" class="account-status status-offline">Offline</span></div></div><i class="fas fa-chevron-right chevron-icon"></i>`; 
        c.onclick=()=>loginAccount(a); 
        accountListContainer.appendChild(c); 
    }); 
}

// ==========================================
// 6. SISTEM CATATANKU (FIREBASE)
// ==========================================
window.openNotesFromAnywhere = function() { notesListModal.classList.remove('hidden'); history.pushState(null, null, "#notes"); };
function closeNotesListModal() { notesListModal.classList.add('hidden'); }
function initNotesSync() { 
    const grid = document.getElementById('notes-grid'); if (!grid) return; 
    db.ref(DB_PATH).orderByChild('timestamp').on('value', snapshot => { 
        grid.innerHTML = ''; let items = []; snapshot.forEach(child => { items.push({ key: child.key, ...child.val() }); }); 
        if(notesCountDisplay) notesCountDisplay.innerText = `(${items.length})`; 
        if(items.length === 0) { grid.innerHTML = '<div class="status-text">Belum ada catatan.</div>'; return; } 
        items.reverse().forEach((d) => { 
            const card = document.createElement('div'); card.className = 'note-card'; card.onclick = () => openNoteDetailModal(d.key, d); 
            const previewText = escapeHTML(d.content).replace(/\n/g, ' '); 
            card.innerHTML = `<div class="note-title">${escapeHTML(d.title) || 'Tanpa Judul'}</div><div class="note-preview">${previewText}</div><div class="note-date">${formatDate(d.timestamp)}</div>`; 
            grid.appendChild(card); 
        }); 
    }); 
}

function formatDate(ts) { if(!ts) return "---"; const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`; }
function escapeHTML(str) { if(!str) return ""; return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

async function initMainApp() { fetchBalance(); await loadShopeeIndonesia(); renderOrders(); startPollingAndTimer(); }

window.onload = () => { 
    history.pushState(null, null, window.location.href); 
    initNotesSync(); 
    if(sessionStorage.getItem('hero_savedAccountName')) loginAccount(sessionStorage.getItem('hero_savedAccountName')); 
    else fetchAccounts(); 
};
