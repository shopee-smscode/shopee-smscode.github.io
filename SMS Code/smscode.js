const BASE_URL = "https://sms-code-proxy.masreno6pro.workers.dev"; 

const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); 

let appSettings = JSON.parse(localStorage.getItem('app_settings')) || { password: "Aku123..", autoCopy: true };
let cachedAccounts = [];

let viewingPresenceRef = null; let activeAccountName = null; let activeOrders = []; let availableProducts = []; 
let currentCountryId = null; let currentServiceId = null; let selectedProductId = 'any'; 
let timerInterval = null; let pollingInterval = null; let orderHistory = []; let usedNumbersDB = new Set(); let hiddenBadOrders = []; let isUsedNumbersLoaded = false; 

const idrFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

const currentAccountName = document.getElementById('currentAccountName'); const productList = document.getElementById('productList'); const btnOrder = document.getElementById('btnOrder'); const activeOrdersContainer = document.getElementById('activeOrdersContainer'); const activeCount = document.getElementById('activeCount'); const balanceDisplay = document.getElementById('balanceDisplay'); const exitModal = document.getElementById('exitModal'); 

// === DROPDOWN & MENU LOGIC ===
window.toggleAppDropdown = function() {
    document.getElementById("appDropdown").classList.toggle("show");
    document.getElementById("menuDropdown").classList.remove("show");
}
window.toggleMenuDropdown = function() {
    document.getElementById("menuDropdown").classList.toggle("show");
    document.getElementById("appDropdown").classList.remove("show");
}
window.onclick = function(event) {
    if (!event.target.matches('.dropbtn') && !event.target.matches('.dropbtn *') && 
        !event.target.matches('.dropbtn-icon') && !event.target.matches('.dropbtn-icon *')) {
        let dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) dropdowns[i].classList.remove('show');
        }
    }
}
window.openIframeNoteModal = function() { document.getElementById('iframeNoteModal').classList.remove('hidden'); history.pushState(null, null, "#notes"); }
window.closeIframeNoteModal = function() { document.getElementById('iframeNoteModal').classList.add('hidden'); }

// === FUNGSI API ===
async function apiCall(endpoint, method = "GET", body = null) { 
    const options = { method: method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } }; 
    if (body) options.body = JSON.stringify(body); 
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, options); 
        const textData = await response.text();
        try { 
            return JSON.parse(textData); 
        } catch (err) {
            let lowerText = textData.toLowerCase();
            if (lowerText.includes("<html") || lowerText.includes("cloudflare") || lowerText.includes("blocked")) {
                return { success: false, error: { message: "Akses diblokir (Cloudflare)." } };
            }
            return { success: false, error: { message: `Data tidak valid/Error ${response.status}` } };
        }
    } catch (err) { return { success: false, error: { message: "Koneksi Proxy Gagal: " + err.message } }; }
}

function openSettingsModal() { document.getElementById('settingsPassword').value = appSettings.password; document.getElementById('settingsAutoCopy').checked = appSettings.autoCopy; document.getElementById('settingsModal').classList.remove('hidden'); history.pushState(null, null, "#settings"); }
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }
window.saveSettings = function() { appSettings.password = document.getElementById('settingsPassword').value; appSettings.autoCopy = document.getElementById('settingsAutoCopy').checked; localStorage.setItem('app_settings', JSON.stringify(appSettings)); closeSettingsModal(); showToast("Pengaturan disimpan!"); renderMainButtons(); }
function renderMainButtons() { const extraBtnWrapper = document.getElementById('extraBtnWrapper'); if (!extraBtnWrapper) return; if (appSettings.autoCopy) { extraBtnWrapper.innerHTML = `<button onclick="copyToClipboard('${appSettings.password}')" class="btn-primary" style="background-color: var(--info-color); margin-top: 6px; width: 100%; border-radius: 12px; color: #fff;"><i class="fas fa-copy"></i> Salin Sandi</button>`; } else { extraBtnWrapper.innerHTML = `<button class="btn-primary" disabled style="background-color: var(--bg-card); color: var(--text-secondary); margin-top: 6px; width: 100%; border-radius: 12px;"><i class="fas fa-check"></i> Selesai (Nonaktif)</button>`; } }
function normalizePhone(phone) { if (!phone) return ""; let p = String(phone).replace(/\D/g, ""); if (p.startsWith("0")) { p = "62" + p.substring(1); } return p; }
function formatPhoneNumber(phone) { if (!phone) return ""; let p = String(phone); if (p.startsWith("62")) { p = "0" + p.substring(2); } return p.replace(/(.{4})/g, '$1 ').trim(); }
function formatOTP(otp) { if (!otp) return ""; const otpStr = String(otp); if (otpStr.length >= 6) { return otpStr.slice(0, 3) + " - " + otpStr.slice(3); } return otpStr; }
function getProviderName(phone) { let p = String(phone); if (p.startsWith("62")) p = "0" + p.substring(2); const prefix = p.substring(0, 4); if (['0811','0812','0813','0821','0822','0852','0853','0851'].includes(prefix)) return "Telkomsel"; if (['0814','0815','0816','0855','0856','0857','0858'].includes(prefix)) return "Indosat"; if (['0817','0818','0819','0859','0877','0878','0838','0831','0832','0833'].includes(prefix)) return "XL/Axis"; if (['0895','0896','0897','0898','0899'].includes(prefix)) return "Tri"; if (['0881','0882','0883','0884','0885','0886','0887','0888','0889'].includes(prefix)) return "Smartfren"; return "Acak"; }
function getOperatorLogo(id) { const i = String(id).toLowerCase(); if (i.includes('telkomsel')) return 'https://assets.telkomsel.com/public/app-logo/2021-06/telkomsel-logo.png'; if (i.includes('indosat') || i.includes('isat') || i.includes('im3')) return 'https://im3-img.indosatooredoo.com/indosatassets/images/myim3_app_footer.svg'; if (i.includes('xl') || i.includes('axis')) return 'https://d17e22l2uh4h4n.cloudfront.net/corpweb/pub-xlaxiata/2019-03/xl-logo.png'; if (i.includes('three') || i.includes('tri') || i.includes('hutchison')) return 'https://www.three.co.uk/content/dam/threedigital/static-files/components/header/three-logo.svg'; if (i.includes('smartfren')) return 'https://down-id.img.susercontent.com/file/id-11134207-8224s-mkkmirlvdurn5d@resize_w900_nl.webp'; return 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png'; }

let isExitModalOpen = false;
window.addEventListener('popstate', (e) => {
    let mods = ['blacklistModal', 'historyModal', 'statsModal', 'settingsModal', 'accountModal', 'iframeNoteModal']; 
    let closedAny = false;
    mods.forEach(m => { let el = document.getElementById(m); if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); closedAny = true; } });
    if (closedAny) { history.pushState(null, null, window.location.href); return; }
    if (isExitModalOpen) { closeExitModal(); history.pushState(null, null, window.location.href); }
    else { exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
});

function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() { setAccountViewingStatus(false); window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }
function setAccountViewingStatus(isViewing) { if (!activeAccountName) return; if (isViewing) { const connectedRef = db.ref('.info/connected'); viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`); connectedRef.on('value', (snap) => { if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); } }); } else { if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); } } }
function updateAccountOrdersStatus() { if (!activeAccountName) return; db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0); }

function initUsedNumbersSync() {
    db.ref('used_numbers/smscode').on('value', snapshot => {
        usedNumbersDB.clear(); let totalBlacklist = 0;
        if (snapshot.exists()) { snapshot.forEach(child => { if (child.val().phone) { let normalPhone = normalizePhone(child.val().phone); usedNumbersDB.add(normalPhone); totalBlacklist++; } }); }
        isUsedNumbersLoaded = true;
        if(document.getElementById('blacklistBadge')) document.getElementById('blacklistBadge').innerText = totalBlacklist;
        if(document.getElementById('blacklistDetailCount')) document.getElementById('blacklistDetailCount').innerText = totalBlacklist;
    });
}

function recordStat(type) { const today = new Date().toLocaleDateString('en-CA'); const statRef = db.ref(`stats/smscode/${today}/${type}`); statRef.transaction(currentCount => (currentCount || 0) + 1); }
window.openStatsModal = function() { document.getElementById('statsModal').classList.remove('hidden'); const dateInput = document.getElementById('statDate'); if(!dateInput.value) dateInput.value = new Date().toLocaleDateString('en-CA'); loadStatsData(); history.pushState(null, null, "#stats"); }
window.closeStatsModal = function() { document.getElementById('statsModal').classList.add('hidden'); }
function loadStatsData() { const selectedDate = document.getElementById('statDate').value; const sSuccess = document.getElementById('statSuccess'); const sFailed = document.getElementById('statFailed'); if(sSuccess) sSuccess.innerText = "..."; if(sFailed) sFailed.innerText = "..."; db.ref(`stats/smscode/${selectedDate}`).once('value', snap => { const data = snap.val(); if(sSuccess) sSuccess.innerText = data?.success || 0; if(sFailed) sFailed.innerText = data?.failed || 0; }); }
document.getElementById('statDate').addEventListener('change', loadStatsData);

window.openBlacklistModal = function() { document.getElementById('blacklistModal').classList.remove('hidden'); history.pushState(null, null, "#blacklist"); }
window.closeBlacklistModal = function() { document.getElementById('blacklistModal').classList.add('hidden'); }

function loadHistory() { orderHistory = JSON.parse(localStorage.getItem(`smscode_history_${activeAccountName}`)) || []; renderHistory(); }
function saveToHistory(order, status) {
    if (!order) return;
    const historyItem = { id: order.id, phone: order.phone, op: order.productId, price: order.price, otp: order.otp || "-", status: status, date: Date.now() };
    orderHistory.unshift(historyItem); if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem(`smscode_history_${activeAccountName}`, JSON.stringify(orderHistory)); renderHistory();
}
function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    if (orderHistory.length === 0) { list.innerHTML = '<div class="status-text-mini" style="text-align:center;">Belum ada riwayat.</div>'; return; }
    list.innerHTML = "";
    orderHistory.forEach(item => {
        const card = document.createElement('div'); card.style.background = "var(--bg-card)"; card.style.padding = "10px"; card.style.borderRadius = "10px"; card.style.border = "1px solid var(--border-color)"; card.style.fontSize = "11px";
        let statusColor = "var(--text-secondary)"; let icon = "fa-clock";
        if (item.status === "SUKSES") { statusColor = "var(--success-color)"; icon = "fa-check-circle"; }
        if (item.status === "BATAL") { statusColor = "var(--danger-color)"; icon = "fa-times-circle"; }
        if (item.status === "GANTI") { statusColor = "var(--warning-color)"; icon = "fa-sync-alt"; }
        if (item.status === "MINTA ULANG") { statusColor = "var(--info-color)"; icon = "fa-envelope"; }
        const opTag = getProviderName(item.phone); const dt = new Date(item.date); const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: var(--text-primary); font-size: 13px; letter-spacing: 1px;">${formatPhoneNumber(item.phone)} <span style="font-size:9px; font-weight:normal; color:var(--text-secondary);">(${opTag})</span></strong>
                <span style="color: ${statusColor}; font-weight: 800;"><i class="fas ${icon}"></i> ${item.status}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 10px; margin-bottom: ${item.status === 'SUKSES' || item.status === 'MINTA ULANG' ? '6px' : '0'};">
                <span>ID: #${item.id}</span><span>${timeStr}</span>
            </div>
            ${item.status === 'SUKSES' || item.status === 'MINTA ULANG' ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px; text-shadow: 0 0 10px rgba(249, 115, 22, 0.3);">${item.otp}</div>` : ''}
        `;
        list.appendChild(card);
    });
}
window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); history.pushState(null, null, "#history"); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Hapus semua riwayat pesanan?")) { orderHistory = []; localStorage.removeItem(`smscode_history_${activeAccountName}`); renderHistory(); } }

async function fetchAccounts() {
    try {
        const res = await fetch(`${BASE_URL}/api/accounts`); const data = await res.json();
        if (data.accounts && data.accounts.length > 0) {
            cachedAccounts = data.accounts; let savedAccount = localStorage.getItem('smscode_last_account');
            let defaultAcc = (savedAccount && cachedAccounts.includes(savedAccount)) ? savedAccount : cachedAccounts[0]; loginAccount(defaultAcc);
        } else { if(document.getElementById('currentAccountBadge')) document.getElementById('currentAccountBadge').innerText = "Tidak ada"; showToast("Tidak ada akun di Server", "error"); }
    } catch (error) { if(document.getElementById('currentAccountBadge')) document.getElementById('currentAccountBadge').innerText = "Error"; showToast("Gagal terhubung ke Server", "error"); }
}

window.openAccountModal = function() {
    const container = document.getElementById('accountListContainer'); container.innerHTML = '<div class="status-text-mini">Memuat akun...</div>';
    document.getElementById('accountModal').classList.remove('hidden'); history.pushState(null, null, "#account");
    container.innerHTML = "";
    cachedAccounts.forEach(acc => {
        const btn = document.createElement('button'); const isActive = (acc === activeAccountName); btn.id = `btn-acc-${acc}`;
        btn.style = `width: 100%; padding: 12px 14px; border-radius: 12px; font-size: 13px; font-weight: bold; text-align: left; display: flex; align-items: center; justify-content: space-between; border: 2px solid ${isActive ? 'var(--primary-color)' : 'var(--border-color)'}; background: ${isActive ? 'var(--bg-body)' : 'var(--bg-card)'}; color: ${isActive ? 'var(--primary-color)' : 'var(--text-primary)'}; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.15);`;
        btn.innerHTML = `<div style="display:flex; align-items:center; gap:6px;"><span>👤 ${acc}</span> ${isActive ? '<i class="fas fa-check-circle"></i>' : ''}</div> <span id="bal-${acc}" style="font-size:14px; font-weight: 900; color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></span>`;
        btn.onclick = () => { switchAccount(acc); closeAccountModal(); }; container.appendChild(btn); fetchBalanceForAccount(acc);
    });
}
window.closeAccountModal = function() { document.getElementById('accountModal').classList.add('hidden'); }

async function fetchBalanceForAccount(accName) {
    try {
        const options = { method: "GET", headers: { "Content-Type": "application/json", "X-Account-Name": accName } };
        const response = await fetch(`${BASE_URL}/balance`, options); const res = await response.json();
        const balEl = document.getElementById(`bal-${accName}`);
        if (balEl) {
            // MENGGUNAKAN CANONICAL AMOUNT DARI API V2 UNTUK MENDAPATKAN IDR
            if (res.success && res.data && res.data.balance) { 
                balEl.innerText = idrFormatter.format(res.data.balance.canonical_amount); 
                balEl.style.color = (accName === activeAccountName) ? "var(--primary-color)" : "var(--text-primary)"; 
            } else { balEl.innerText = "Error"; balEl.style.color = "var(--danger-color)"; }
        }
    } catch (err) { const balEl = document.getElementById(`bal-${accName}`); if (balEl) { balEl.innerText = "Gagal"; balEl.style.color = "var(--danger-color)"; } }
}

window.switchAccount = function(accountName) {
    if (activeAccountName === accountName) return;
    localStorage.setItem('smscode_last_account', accountName);
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    setAccountViewingStatus(false);
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text-mini">Memuat pesanan...</div>';
    const bDisplay = document.getElementById('balanceDisplay'); if (bDisplay) bDisplay.innerText = "..."; 
    loginAccount(accountName);
};

function loginAccount(accountName) { 
    activeAccountName = accountName; if(document.getElementById('currentAccountBadge')) document.getElementById('currentAccountBadge').innerText = accountName;
    if (currentAccountName) currentAccountName.innerText = accountName; 
    setAccountViewingStatus(true); 
    const now = Date.now(); const rawOrders = JSON.parse(localStorage.getItem(`orders_${accountName}`)) || []; activeOrders = rawOrders.filter(o => o.expiresAt > now); 
    if (rawOrders.length !== activeOrders.length) saveToStorage(); 
    loadHistory(); initMainApp(); 
}

function saveToStorage() { localStorage.setItem(`orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }
function showToast(pesan, type = "success") { const toast = document.getElementById("toast"); if (!toast) return; toast.innerHTML = pesan; if (type === "error") { toast.style.backgroundColor = "var(--danger-color)"; toast.style.color = "#ffffff"; } else { toast.style.backgroundColor = "var(--success-color)"; toast.style.color = "#000"; } toast.classList.add("show"); setTimeout(() => { toast.classList.remove("show"); }, 3000); }
function copyToClipboard(text) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(text); }); } else { copyFallback(text); } }
function copyFallback(text) { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } document.body.removeChild(ta); }

async function fetchBalance() { 
    try { 
        const res = await apiCall('/balance'); 
        if (res.success && res.data && res.data.balance) { 
            const bDisplay = document.getElementById('balanceDisplay'); 
            // MENGGUNAKAN CANONICAL AMOUNT DARI API V2 UNTUK MENDAPATKAN IDR
            if (bDisplay) bDisplay.innerText = idrFormatter.format(res.data.balance.canonical_amount); 
        } 
    } catch (error) { 
        const bDisplay = document.getElementById('balanceDisplay'); 
        if (bDisplay) bDisplay.innerText = "Error"; 
    } 
}

// === FUNGSI LOAD SERVICES (TAMPILKAN DROPDOWN) ===
async function loadServices() {
    const serviceSelect = document.getElementById('serviceSelect'); if (!serviceSelect) return;
    try {
        const countriesRes = await apiCall('/catalog/countries'); 
        if (!countriesRes.success) return;
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        if (!indo) return;
        currentCountryId = indo.id;

        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        if (servicesRes.success && servicesRes.data) {
            let services = servicesRes.data; 
            services.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            serviceSelect.innerHTML = ''; 
            let shopeeId = null;
            services.forEach(svc => {
                const opt = document.createElement('option'); opt.value = svc.id; opt.textContent = (svc.name || svc.id).toUpperCase(); serviceSelect.appendChild(opt);
                if (svc.name && svc.name.toLowerCase().includes('shopee')) shopeeId = svc.id;
            });
            let savedId = localStorage.getItem('smscode_selected_service'); 
            let exists = services.find(s => String(s.id) === String(savedId));
            currentServiceId = exists ? savedId : (shopeeId ? shopeeId : services[0].id);
            serviceSelect.value = currentServiceId; 
            localStorage.setItem('smscode_selected_service', currentServiceId); 
            loadProducts(currentServiceId);
        }
    } catch (e) { serviceSelect.innerHTML = '<option value="">Gagal Jaringan</option>'; }
}

window.changeService = function() { 
    currentServiceId = document.getElementById('serviceSelect').value; 
    localStorage.setItem('smscode_selected_service', currentServiceId); 
    loadProducts(currentServiceId); 
}

// === FUNGSI LOAD PRODUCTS (KARTU LOGO OPERATOR DARI V2) ===
async function loadProducts(serviceId) {
    try {
        if (productList) productList.innerHTML = '<div class="status-text-mini">Mencari Server...</div>';
        const btnOrder = document.getElementById('btnOrder');
        if (btnOrder) btnOrder.disabled = true;

        const productsRes = await apiCall(`/catalog/products?country_id=${currentCountryId}&platform_id=${serviceId}`);
        if (productsRes.success && productsRes.data && productsRes.data.length > 0) {
            
            // PENGAMBILAN HARGA IDR MENGGUNAKAN CANONICAL AMOUNT V2
            let ops = productsRes.data.map(p => ({
                id: p.id,
                name: p.operator_name || p.name || `Server ${p.id}`,
                operator_id: p.operator_id,
                price: p.price ? p.price.canonical_amount : 0,
                available: p.available
            })).sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
            
            let anyOp = ops.find(p => p.operator_id === null);
            let specificOps = ops.filter(p => p.operator_id !== null);

            // LOGIKA PEMISAHAN ACAK & OPERATOR RESMI
            if (!anyOp && ops.length > 0) {
                anyOp = { id: 'any', name: 'Acak', price: ops[0].price, available: 'Auto' };
            } else if (anyOp) {
                anyOp.id = 'any'; 
                anyOp.name = 'Acak';
            }

            availableProducts = anyOp ? [anyOp, ...specificOps] : specificOps;
            
            if (productList) productList.innerHTML = ''; 
            let savedOp = localStorage.getItem('smscode_selected_server') || 'any';
            let isOpExist = availableProducts.find(p => String(p.id) === String(savedOp));
            selectedProductId = isOpExist ? savedOp : 'any'; 
            localStorage.setItem('smscode_selected_server', selectedProductId);

            const chkRandom = document.getElementById('chkRandomOp'); 
            if (chkRandom) chkRandom.checked = (selectedProductId === 'any');

            if (btnOrder) btnOrder.disabled = false;
            
            availableProducts.forEach(product => {
                if (product.id === 'any') return; 
                
                let opCode = product.id;
                let opName = product.name.toUpperCase();
                
                const card = document.createElement("div"); card.className = "product-card"; card.id = `op-card-${opCode}`;
                if (selectedProductId === String(opCode)) card.classList.add('selected');
                
                let logoImg = getOperatorLogo(opName); 
                let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
                const displayPrice = idrFormatter.format(product.price);
                
                card.innerHTML = `<div class="op-logo-container"><img src="${logoImg}" onerror="this.onerror=null; this.src='${fallbackImg}';" class="op-logo" alt="${opName}"></div><div class="product-info"><h4>${opName}</h4><p style="font-size:9px; margin:0; color:var(--text-secondary);">Stok: ${product.available}</p></div><div class="product-price">${displayPrice}</div>`;
                
                card.onclick = () => { 
                    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); 
                    card.classList.add('selected'); 
                    const chk = document.getElementById('chkRandomOp'); 
                    if (chk) chk.checked = false;
                    selectedProductId = String(opCode); 
                    localStorage.setItem('smscode_selected_server', selectedProductId); 
                    if (btnOrder) btnOrder.disabled = false; 
                };
                if (productList) productList.appendChild(card);
            });
        } else { if (productList) productList.innerHTML = '<div class="status-text-mini">Server sedang kosong.</div>'; }
    } catch (error) { if (productList) productList.innerHTML = `<div class="status-text-mini" style="color:var(--danger-color);">Error muat data.</div>`; }
}

window.toggleRandomOperator = function() {
    const chk = document.getElementById('chkRandomOp');
    if (chk.checked) { 
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); 
        selectedProductId = 'any'; 
        localStorage.setItem('smscode_selected_server', 'any'); 
    } else { 
        if(selectedProductId === 'any' && availableProducts.length > 1) { 
            const f = availableProducts.find(p => p.id !== 'any'); 
            if(f) { 
                selectedProductId = String(f.id); 
                document.getElementById(`op-card-${f.id}`).classList.add('selected'); 
                localStorage.setItem('smscode_selected_server', selectedProductId); 
            } 
        } 
    }
    const btn = document.getElementById('btnOrder');
    if (btn) btn.disabled = false;
}

async function processOrderFreshNumber(productId, maxRetries = 5) {
    if (maxRetries <= 0) { showToast("Terlalu banyak stok nomor bekas.", "error"); return null; }
    
    let finalProductId = productId;
    if (finalProductId === 'any') {
        const validOps = availableProducts.filter(p => p.id !== 'any' && p.available > 0);
        if (validOps.length > 0) finalProductId = validOps[0].id; 
        else finalProductId = availableProducts.find(p => p.id !== 'any')?.id;
    }
    if(!finalProductId) return null;

    const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(finalProductId), quantity: 1 });
    if (res.success && res.data && res.data.orders && res.data.orders.length > 0) {
        const o = res.data.orders[0]; const rawPhone = String(o.phone_number); const phoneStr = normalizePhone(rawPhone);
        if (usedNumbersDB.has(phoneStr)) {
            showToast(`⚠️ Nomor ${rawPhone} bekas. Mencari lagi...`, "warning");
            hiddenBadOrders.push({ id: o.id, cancelAt: Date.now() + (3 * 60 * 1000), isCanceling: false });
            localStorage.setItem(`smscode_hidden_bad_orders_${activeAccountName}`, JSON.stringify(hiddenBadOrders));
            return await processOrderFreshNumber(productId, maxRetries - 1);
        } else { 
            o.finalProductId = finalProductId; 
            return o; 
        }
    } else { 
        showToast(res.error ? res.error.message : "Gagal mendapat nomor API", "error"); 
        return null; 
    }
}

window.onOrderButtonClicked = async function() {
    const btn = document.getElementById('btnOrder');
    if (!btn) return;
    
    if (!isUsedNumbersLoaded) { showToast("Sabar, sedang sinkronisasi database...", "warning"); return; }
    if (!selectedProductId) { showToast("Silakan pilih server operator!", "error"); return; }
    
    btn.disabled = true; 
    const originalText = btn.innerText; 
    btn.innerText = "Memproses...";
    
    try {
        const o = await processOrderFreshNumber(selectedProductId, 5); 
        if (o) {
            const actualProductId = o.finalProductId || selectedProductId;
            const opInfo = availableProducts.find(p => String(p.id) === String(actualProductId)); 
            
            // BACA HARGA DARI V2 ATAU DARI DATA PRODUK LOKAL
            let opPrice = 0;
            if (o.amount && o.amount.canonical_amount) { opPrice = o.amount.canonical_amount; } 
            else if (opInfo && opInfo.price) { opPrice = opInfo.price; }

            const expiresAtMs = o.expires_at ? new Date(o.expires_at).getTime() : Date.now() + (20 * 60 * 1000); 
            const createdAtMs = o.created_at ? new Date(o.created_at).getTime() : Date.now();
            
            activeOrders.unshift({ 
                id: o.id, 
                productId: parseInt(actualProductId), 
                phone: o.phone_number, 
                price: opPrice, 
                otp: null, 
                status: "ACTIVE", 
                expiresAt: expiresAtMs, 
                cancelUnlockTime: createdAtMs + (120 * 1000), 
                isAutoCanceling: false,
                disableAutoCancel: false
            });
            saveToStorage(); 
            startPollingAndTimer(); 
            fetchBalance(); 
            copyToClipboard(o.phone_number); 
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (e) { showToast("Terjadi kesalahan teknis.", "error"); }
    
    btn.disabled = false; btn.innerText = originalText;
};

function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = ""; const now = Date.now();
    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`; 
        let isSuccess = (order.status === "OTP_RECEIVED" && order.otp); const wait = order.cancelUnlockTime - now;
        let otpHtml = isSuccess ? `<div class="otp-title">KODE OTP</div><div class="otp-code">${formatOTP(order.otp)}</div>` : `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU...</div>`;
        
        // MENAMPILKAN LOGO OPERATOR DI KARTU PESANAN
        const matchedProduct = availableProducts.find(p => String(p.id) === String(order.productId));
        let opTag = matchedProduct && matchedProduct.name ? matchedProduct.name : (order.productId || 'Acak');
        if (opTag === 'Acak') opTag = getProviderName(order.phone);
        opTag = String(opTag).toUpperCase();
        
        let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";
        if (isSuccess) { finishBtnAttr = ""; resendBtnAttr = ""; cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; } else if (wait <= 0 && !order.isAutoCanceling) { cancelBtnAttr = ""; replaceBtnAttr = ""; resendBtnAttr = "disabled"; } else if (order.isAutoCanceling) { cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; resendBtnAttr = "disabled"; }
        
        const displayPrice = (order.price && order.price != 0) ? idrFormatter.format(order.price) : idrFormatter.format(matchedProduct?.price || 0);
        let headerLogoUrl = getOperatorLogo(opTag); let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
        
        card.innerHTML = `<div class="order-header"><div class="order-info-left" style="display: flex; align-items: center; gap: 10px;"><div style="width: 28px; height: 28px; background: #fff; border-radius: 6px; padding: 3px; display: flex; justify-content: center; align-items: center;"><img src="${headerLogoUrl}" onerror="this.onerror=null; this.src='${fallbackImg}';" style="max-width: 100%; max-height: 100%; object-fit: contain;"></div><div><div class="order-id-label" style="display:inline-block; margin-bottom:2px;">#${order.id}</div><div class="order-price" style="display:block;">${displayPrice}</div></div></div><span class="timer" id="timer-${order.id}">--:--</span></div><div class="phone-row"><span class="phone-number">${formatPhoneNumber(order.phone)}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button></div><div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div><div class="action-buttons-grid"><button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}')" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button><button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button><button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button><button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button></div>`;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now; const timerElement = document.getElementById(`timer-${order.id}`);
            if (timeLeft <= 0) { activeOrders.splice(index, 1); saveToStorage(); fetchBalance(); return; }
            if (timerElement) { 
                const m = Math.floor((timeLeft / 1000 / 60) % 60); const s = Math.floor((timeLeft / 1000) % 60); 
                timerElement.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`; 
                if (timeLeft <= 12 * 60000) { timerElement.style.color = "var(--danger-color)"; } else if (timeLeft <= 18 * 60000) { timerElement.style.color = "var(--warning-color)"; } else { timerElement.style.color = "#ffffff"; }
            }
            
            if (timeLeft <= 600000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling && !order.disableAutoCancel) { order.isAutoCanceling = true; cancelSpecificOrder(order.id, true); }
            
            const wait = order.cancelUnlockTime - now; const btnCancel = document.getElementById(`btn-cancel-${order.id}`); const btnReplace = document.getElementById(`btn-replace-${order.id}`); const btnResend = document.getElementById(`btn-resend-${order.id}`); 
            if (order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) {
                if (wait <= 0) { if (btnCancel && btnCancel.disabled) btnCancel.disabled = false; if (btnReplace && btnReplace.disabled && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false; if (btnResend && !btnResend.disabled) btnResend.disabled = true; } 
                else { if (btnCancel && !btnCancel.disabled) btnCancel.disabled = true; if (btnReplace && !btnReplace.disabled) btnReplace.disabled = true; if (btnResend && !btnResend.disabled) btnResend.disabled = true; }
            }
        });
    }, 1000);
    
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) return;
        for (let i = 0; i < activeOrders.length; i++) {
            let order = activeOrders[i]; if (order.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/orders/${order.id}`);
                if (res.success) {
                    if (res.data.status === "OTP_RECEIVED") { 
                        notifSound.play().catch(e => console.log("Sound error:", e));
                        activeOrders[i].status = "OTP_RECEIVED"; 
                        // MENGGUNAKAN otp_code SESUAI STANDAR V2
                        activeOrders[i].otp = res.data.otp_code; 
                        saveToStorage(); fetchBalance();
                        const phoneStr = normalizePhone(activeOrders[i].phone);
                        if (!usedNumbersDB.has(phoneStr)) { db.ref('used_numbers/smscode').push({ phone: phoneStr, timestamp: Date.now() }); usedNumbersDB.add(phoneStr); }
                    } else if (res.data.status !== "ACTIVE" && res.data.status !== "PENDING") { activeOrders = activeOrders.filter(o => o.id !== order.id); saveToStorage(); fetchBalance(); }
                }
            } catch (e) {}
        }
    }, 10000);
}

async function syncServerOrders() {
    try {
        const res = await apiCall('/orders'); 
        if (res.success && res.data) {
            let serverOrders = Array.isArray(res.data) ? res.data : (res.data.data || []);
            serverOrders = serverOrders.filter(o => o.status === 'ACTIVE' || o.status === 'OTP_RECEIVED' || o.status === 'PENDING');
            serverOrders.forEach(order => {
                if (!activeOrders.find(o => o.id === order.id)) {
                    let syncedPrice = 0;
                    if (order.amount && order.amount.canonical_amount) { syncedPrice = order.amount.canonical_amount; } 
                    else if (order.product_id && availableProducts.length > 0) { const matchProduct = availableProducts.find(p => String(p.id) === String(order.product_id)); if (matchProduct) syncedPrice = matchProduct.price; }
                    
                    const exp = order.expires_at ? new Date(order.expires_at).getTime() : Date.now() + (20*60*1000);
                    const cTime = order.created_at ? new Date(order.created_at).getTime() : (exp - (20*60*1000));
                    
                    activeOrders.unshift({ id: order.id, productId: order.product_id || order.catalog_product_id, phone: order.phone_number || order.phone, price: syncedPrice, otp: order.otp_code, status: order.status, expiresAt: exp, cancelUnlockTime: cTime + (120*1000), isAutoCanceling: false, disableAutoCancel: false });
                }
            });
            saveToStorage(); startPollingAndTimer(); fetchBalance();
        }
    } catch (e) {}
}

function removeOrderWithAnimation(idStr, callback) { const card = document.getElementById(`order-card-${idStr}`); if (card) { card.classList.add('removing'); setTimeout(() => { callback(); }, 300); } else { callback(); } }

window.replaceSpecificOrder = async function(orderId) {
    if (!isUsedNumbersLoaded) { showToast("Sabar, sedang mensinkronkan database nomor...", "warning"); return; }
    const idStr = String(orderId).trim();
    const btn = document.getElementById(`btn-replace-${idStr}`); 
    const oldOrder = activeOrders.find(o => String(o.id) === idStr); 
    const opToUse = oldOrder ? oldOrder.productId : selectedProductId;
    
    if (!opToUse) return showToast("Pilih server manual.", "error"); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    if (oldOrder) saveToHistory(oldOrder, "GANTI");
    
    try {
        const c = await apiCall('/orders/cancel', 'POST', { id: idStr });
        if (c.success || (c.error && c.error.code === 'NOT_FOUND')) {
            removeOrderWithAnimation(idStr, async () => {
                activeOrders = activeOrders.filter(o => String(o.id) !== idStr);
                const n = await processOrderFreshNumber(opToUse, 5);
                if (n) {
                    const actualProductId = n.finalProductId || opToUse;
                    const pInfo = availableProducts.find(p => String(p.id) === String(actualProductId)); 
                    let finalPrice = 0; if (n.amount && n.amount.canonical_amount) { finalPrice = n.amount.canonical_amount; } else if (pInfo && pInfo.price) { finalPrice = pInfo.price; }
                    
                    const expiresAtMs = n.expires_at ? new Date(n.expires_at).getTime() : Date.now() + (20 * 60 * 1000); 
                    activeOrders.unshift({ id: n.id, productId: parseInt(actualProductId), phone: n.phone_number || n.phone, price: finalPrice, otp: null, status: "ACTIVE", expiresAt: expiresAtMs, cancelUnlockTime: Date.now() + (120*1000), isAutoCanceling: false, disableAutoCancel: false });
                    saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(n.phone_number || n.phone); showToast("Nomor diganti!");
                } else { saveToStorage(); fetchBalance(); }
            });
        } else { showToast("Gagal batal lama.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
    } catch (e) { showToast("Error Jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

window.resendSpecificOrder = async function(orderId) {
    const idStr = String(orderId); const btn = document.getElementById(`btn-resend-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const res = await apiCall('/orders/resend', 'POST', { id: idStr });
        if (res.success) { 
            showToast("Meminta kode baru..."); 
            let idx = activeOrders.findIndex(o => String(o.id) === idStr);
            if (idx !== -1) { 
                saveToHistory(activeOrders[idx], "MINTA ULANG"); 
                activeOrders[idx].status = "ACTIVE"; 
                activeOrders[idx].otp = null; 
                activeOrders[idx].disableAutoCancel = true;
                saveToStorage(); 
            }
        } else { showToast(res.error ? res.error.message : "Gagal meminta ulang.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
    } catch (e) { showToast("Kesalahan jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

window.cancelSpecificOrder = async function(id, auto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${id}`); if (btnCancel) { btnCancel.disabled = true; btnCancel.innerHTML = '<div class="loader"></div>'; }
    try { 
        const res = await apiCall('/orders/cancel', 'POST', { id: id }); 
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { 
            const oldOrder = activeOrders.find(o => String(o.id) === String(id)); if (oldOrder) saveToHistory(oldOrder, "BATAL"); recordStat('failed');
            removeOrderWithAnimation(id, () => { activeOrders = activeOrders.filter(o => String(o.id) !== String(id)); saveToStorage(); fetchBalance(); if(auto) showToast("Otomatis dibatalkan (Waktu Habis)", "error"); else showToast("Pesanan dibatalkan", "success"); }); 
        } else { showToast("Gagal dibatalkan.", "error"); if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } } 
    } catch (e) { if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } }
};

window.finishSpecificOrder = async function(id) {
    const btnFinish = document.getElementById(`btn-finish-${id}`); if (btnFinish) { btnFinish.disabled = true; btnFinish.innerHTML = '<div class="loader"></div>'; }
    const oldOrder = activeOrders.find(o => String(o.id) === String(id)); if (oldOrder) saveToHistory(oldOrder, "SUKSES");
    if (appSettings.autoCopy) { copyToClipboard(appSettings.password); } recordStat('success');
    try { await apiCall('/orders/finish', 'POST', { id: id }); } catch (e) {} 
    removeOrderWithAnimation(id, () => { activeOrders = activeOrders.filter(o => o.id !== id); saveToStorage(); });
};

async function initMainApp() { const bDisplay = document.getElementById('balanceDisplay'); if (bDisplay) bDisplay.innerText = "..."; await loadServices(); renderOrders(); if (activeOrders.length > 0) startPollingAndTimer(); syncServerOrders(); }

window.onload = () => { relocateBalanceUI(); setAccountViewingStatus(false); history.pushState(null, null, window.location.href); initUsedNumbersSync(); fetchAccounts(); renderMainButtons(); };
