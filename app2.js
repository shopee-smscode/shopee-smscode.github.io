const BASE_URL = "https://hero-sms-proxy.masreno6pro.workers.dev"; // [!] GANTI DENGAN URL WORKER ANDA

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

let selectedNoteKey = null, isEditingNote = false, currentNoteRawContent = "", viewingPresenceRef = null, isPresenceListenerAttached = false;
let activeAccountName = null, activeOrders = [], availableProducts = [], selectedProductId = null, timerInterval = null, pollingInterval = null;

const accountView = document.getElementById('accountView'), appView = document.getElementById('appView'), accountListContainer = document.getElementById('accountListContainer'), btnSwitchAccount = document.getElementById('btnSwitchAccount'), currentAccountName = document.getElementById('currentAccountName'), productList = document.getElementById('productList'), btnOrder = document.getElementById('btnOrder'), activeOrdersContainer = document.getElementById('activeOrdersContainer'), activeCount = document.getElementById('activeCount'), balanceDisplay = document.getElementById('balanceDisplay'), exitModal = document.getElementById('exitModal'), notesListModal = document.getElementById('notesListModal'), noteFormModal = document.getElementById('noteFormModal'), noteDetailModal = document.getElementById('noteDetailModal'), notesCountDisplay = document.getElementById('notesCount');

// FORMAT MATA UANG USD
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

async function fetchBalance() {
    try {
        if (balanceDisplay) balanceDisplay.innerText = "...";
        const res = await apiCall('/balance');
        if (res.success) balanceDisplay.innerText = usdFormatter.format(res.data.balance);
    } catch (e) { balanceDisplay.innerText = "Error"; }
}

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
    } catch (e) { productList.innerHTML = '<div class="status-text">Gagal memuat data.</div>'; }
}

function renderOrders() {
    activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; return; }
    activeOrdersContainer.innerHTML = "";
    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card";
        const isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        const wait = order.cancelUnlockTime - Date.now();
        const displayPrice = (order.price && order.price != 0) ? usdFormatter.format(order.price) : usdFormatter.format(availableProducts[0]?.price || 0);
        
        card.innerHTML = `
            <div class="order-header"><div><span class="order-id-label">#${order.id}</span> <span class="order-price">${displayPrice}</span></div><span class="timer" id="timer-${order.id}">--:--</span></div>
            <div class="phone-row"><span class="phone-number">${order.phone}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button></div>
            <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${isSuccess ? '<div class="otp-title">KODE OTP</div><div class="otp-code">'+order.otp+'</div>' : '<div class="modern-loader"><span></span><span></span><span></span></div><div class="waiting-text">MENUNGGU SMS</div>'}</div>
            <div class="action-buttons-grid">
                <button class="btn-replace" onclick="replaceSpecificOrder(${order.id}, '${order.productId}')" ${isSuccess || wait > 0 ? 'disabled' : ''}><i class="fas fa-sync-alt"></i> Ganti</button>
                <button class="btn-resend" onclick="resendSpecificOrder(${order.id})" ${isSuccess || wait > 0 ? 'disabled' : ''}><i class="fas fa-envelope"></i> Ulang</button>
                <button class="btn-danger" onclick="cancelSpecificOrder(${order.id})" ${isSuccess || wait > 0 ? 'disabled' : ''}>Batalkan</button>
                <button class="btn-success" onclick="finishSpecificOrder(${order.id})" ${!isSuccess ? 'disabled' : ''}>Selesai</button>
            </div>`;
        activeOrdersContainer.appendChild(card);
    });
}

// ==========================================
// KODE LANJUTAN STANDAR (TIMER & SISTEM)
// ==========================================
btnOrder.onclick = async () => {
    btnOrder.disabled = true; btnOrder.innerText = "Memproses...";
    try {
        const res = await apiCall('/orders/create', 'POST');
        if (res.success) {
            const o = res.data.orders[0];
            activeOrders.unshift({ id: o.id, productId: 'ka', phone: o.phone_number, price: availableProducts[0].price, otp: null, status: "ACTIVE", expiresAt: new Date(o.expires_at).getTime(), cancelUnlockTime: Date.now() + (120000), isAutoCanceling: false });
            saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(o.phone_number);
        } else { showToast(res.error.message); }
    } catch (e) { showToast("Gagal terhubung."); }
    btnOrder.disabled = false; btnOrder.innerText = "Pesan Nomor Baru";
};

function saveToStorage() { localStorage.setItem(`hero_orders_${activeAccountName}`, JSON.stringify(activeOrders)); renderOrders(); }
function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        activeOrders.forEach((o, i) => {
            const left = o.expiresAt - Date.now();
            const el = document.getElementById(`timer-${o.id}`);
            if (left <= 0) { activeOrders.splice(i, 1); saveToStorage(); return; }
            if (el) { const m = Math.floor(left/60000), s = Math.floor((left%60000)/1000); el.innerText = `${m}:${s<10?'0':''}${s}`; }
        });
    }, 1000);
    if (!pollingInterval) pollingInterval = setInterval(async () => {
        activeOrders.forEach(async (o, i) => {
            if (o.status === "OTP_RECEIVED") return;
            const res = await apiCall(`/orders/${o.id}`);
            if (res.success && res.data.status === "OTP_RECEIVED") { activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.otp_code; saveToStorage(); }
        });
    }, 5000);
}

window.cancelSpecificOrder = async (id) => { const res = await apiCall('/orders/cancel', 'POST', { id }); if (res.success) { activeOrders = activeOrders.filter(o => o.id != id); saveToStorage(); fetchBalance(); } };
window.finishSpecificOrder = async (id) => { await apiCall('/orders/finish', 'POST', { id }); activeOrders = activeOrders.filter(o => o.id != id); saveToStorage(); };
window.resendSpecificOrder = async (id) => { const res = await apiCall('/orders/resend', 'POST', { id }); if (res.success) showToast("Permintaan ulang dikirim."); };

// SISTEM UI & LOGIN (SAMA DENGAN APP.JS)
function showToast(p) { const t = document.getElementById("toast"); t.innerText = p; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 2500); }
function copyToClipboard(t) { navigator.clipboard.writeText(t).then(()=>showToast("Disalin!")); }
function loginAccount(n) { activeAccountName = n; sessionStorage.setItem('hero_savedAcc', n); appView.classList.remove('hidden'); accountView.classList.add('hidden'); currentAccountName.innerText = n; initMainApp(); }
async function initMainApp() { fetchBalance(); await loadShopeeIndonesia(); renderOrders(); startPollingAndTimer(); }
async function fetchAccounts() { const res = await fetch(`${BASE_URL}/api/accounts`); const d = await res.json(); accountListContainer.innerHTML = ""; d.accounts.forEach(a => { const c = document.createElement('div'); c.className="account-card"; c.innerHTML=`<span class="account-name">${a}</span>`; c.onclick=()=>loginAccount(a); accountListContainer.appendChild(c); }); }
window.onload = () => { fetchAccounts(); if(sessionStorage.getItem('hero_savedAcc')) loginAccount(sessionStorage.getItem('hero_savedAcc')); };
