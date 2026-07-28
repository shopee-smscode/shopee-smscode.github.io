const BASE_URL = "https://hero-sms-proxy.masreno6pro.workers.dev"; 

const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); 

let appSettings = JSON.parse(localStorage.getItem('app_settings')) || { password: "Aku123..", autoCopy: true };
let viewingPresenceRef = null; let activeAccountName = null; let activeOrders = []; let availableProducts = []; let selectedProductId = null; let timerInterval = null; let pollingInterval = null; let orderHistory = [];
let usedNumbersDB = new Set(); let hiddenBadOrders = []; let isUsedNumbersLoaded = false; 
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

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
window.openIframeNoteModal = function() {
    document.getElementById('iframeNoteModal').classList.remove('hidden');
    history.pushState(null, null, "#notes");
}
window.closeIframeNoteModal = function() {
    document.getElementById('iframeNoteModal').classList.add('hidden');
}

// === FUNGSI API (DENGAN DETEKSI CLOUDFLARE/HTML BLOCKED) ===
async function apiCall(endpoint, method = "GET", body = null) { 
    const options = { method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } }; 
    if (body) options.body = JSON.stringify(body); 
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, options); 
        const textData = await response.text();
        try { 
            return JSON.parse(textData); 
        } catch (err) {
            let lowerText = textData.toLowerCase();
            // DETEKSI CLOUDFLARE ATAU HALAMAN HTML
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
function renderMainButtons() { const extraBtnWrapper = document.getElementById('extraBtnWrapper'); if (!extraBtnWrapper) return; if (appSettings.autoCopy) { extraBtnWrapper.innerHTML = `<button onclick="copyToClipboard('${appSettings.password}')" class="btn-primary" style="background-color: var(--info-color); margin-top: 6px; width: 100%; border-radius: 12px;"><i class="fas fa-copy"></i> Salin Sandi</button>`; } else { extraBtnWrapper.innerHTML = `<button class="btn-primary" disabled style="background-color: var(--bg-card); color: var(--text-secondary); margin-top: 6px; width: 100%; border-radius: 12px;"><i class="fas fa-check"></i> Selesai (Nonaktif)</button>`; } }
function normalizePhone(phone) { if (!phone) return ""; let p = String(phone).replace(/\D/g, ""); if (p.startsWith("0")) { p = "62" + p.substring(1); } return p; }
function formatPhoneNumber(phone) { if (!phone) return ""; let p = String(phone); if (p.startsWith("62")) { p = "0" + p.substring(2); } return p.replace(/(.{4})/g, '$1 ').trim(); }
function formatOTP(otp) { if (!otp) return ""; const otpStr = String(otp); if (otpStr.length >= 6) { return otpStr.slice(0, 3) + " - " + otpStr.slice(3); } return otpStr; }
function getProviderName(phone) { let p = String(phone); if (p.startsWith("62")) p = "0" + p.substring(2); const prefix = p.substring(0, 4); if (['0811','0812','0813','0821','0822','0852','0853','0851'].includes(prefix)) return "Telkomsel"; if (['0814','0815','0816','0855','0856','0857','0858'].includes(prefix)) return "Indosat"; if (['0817','0818','0819','0859','0877','0878','0838','0831','0832','0833'].includes(prefix)) return "XL"; if (['0895','0896','0897','0898','0899'].includes(prefix)) return "Three"; if (['0881','0882','0883','0884','0885','0886','0887','0888','0889'].includes(prefix)) return "Smartfren"; return "Acak"; }
function getOperatorLogo(id) { const i = String(id).toLowerCase(); if (i.includes('telkomsel')) return 'https://assets.telkomsel.com/public/app-logo/2021-06/telkomsel-logo.png'; if (i.includes('indosat')) return 'https://im3-img.indosatooredoo.com/indosatassets/images/myim3_app_footer.svg'; if (i.includes('xl')) return 'https://d17e22l2uh4h4n.cloudfront.net/corpweb/pub-xlaxiata/2019-03/xl-logo.png'; if (i.includes('axis')) return 'https://www.axis.co.id/img/common/logo.svg'; if (i.includes('three') || i.includes('tri')) return 'https://www.three.co.uk/content/dam/threedigital/static-files/components/header/three-logo.svg'; if (i.includes('smartfren')) return 'https://down-id.img.susercontent.com/file/id-11134207-8224s-mkkmirlvdurn5d@resize_w900_nl.webp'; return 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png'; }
function relocateBalanceUI() { const headerContainer = document.querySelector('.app-header-container'); const balanceContainer = document.querySelector('.balance-container'); if(headerContainer && balanceContainer && !document.getElementById('newBalanceDisplay')) { balanceContainer.style.display = 'none'; const newBalanceDiv = document.createElement('div'); newBalanceDiv.style.textAlign = 'right'; newBalanceDiv.innerHTML = `<span style="font-size: 10px; color: var(--text-secondary); font-weight: bold; text-transform: uppercase; display: block;">Saldo</span><span id="newBalanceDisplay" style="font-size: 16px; font-weight: 900; color: var(--primary-color);">...</span>`; headerContainer.appendChild(newBalanceDiv); const oldBalance = document.getElementById('balanceDisplay'); if(oldBalance) oldBalance.removeAttribute('id'); newBalanceDiv.querySelector('span:last-child').id = 'balanceDisplay'; } }

let isExitModalOpen = false;
window.addEventListener('popstate', (e) => {
    let mods = ['blacklistModal', 'historyModal', 'statsModal', 'settingsModal', 'iframeNoteModal']; 
    let closedAny = false;
    mods.forEach(m => { 
        let el = document.getElementById(m); 
        if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); closedAny = true; } 
    });
    if (closedAny) { history.pushState(null, null, window.location.href); return; }
    if (isExitModalOpen) { closeExitModal(); history.pushState(null, null, window.location.href); }
    else { exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
});

function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() { setAccountViewingStatus(false); window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }

function saveToStorage() { localStorage.setItem(`hero_orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }
function showToast(pesan, type = "success") { const t = document.getElementById("toast"); if(!t) return; t.innerHTML = pesan; if (type === "error") { t.style.backgroundColor = "var(--danger-color)"; t.style.color = "#ffffff"; } else if (type === "warning") { t.style.backgroundColor = "var(--warning-color)"; t.style.color = "#000000"; } else { t.style.backgroundColor = "var(--success-color)"; t.style.color = "#ffffff"; } t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 4000); }
function copyToClipboard(t) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(t); }); } else { copyFallback(t); } }
function copyFallback(t) { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } document.body.removeChild(ta); }
function setAccountViewingStatus(isViewing) { if (!activeAccountName) return; if (isViewing) { const connectedRef = db.ref('.info/connected'); viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`); connectedRef.on('value', (snap) => { if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); } }); } else { if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); } } }
function updateAccountOrdersStatus() { if (!activeAccountName) return; db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0); }

function initUsedNumbersSync() {
    db.ref('used_numbers/hero_sms').on('value', snapshot => {
        usedNumbersDB.clear(); let operatorCounts = {}; let totalBlacklist = 0;
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                if (child.val().phone) {
                    let normalPhone = normalizePhone(child.val().phone); usedNumbersDB.add(normalPhone); totalBlacklist++;
                    let op = getProviderName(normalPhone); operatorCounts[op] = (operatorCounts[op] || 0) + 1;
                }
            });
        }
        isUsedNumbersLoaded = true;
        if(document.getElementById('blacklistBadge')) document.getElementById('blacklistBadge').innerText = totalBlacklist;
        if(document.getElementById('blacklistDetailCount')) document.getElementById('blacklistDetailCount').innerText = totalBlacklist;
        let breakdownText = "";
        for (let op in operatorCounts) { breakdownText += `<span style="display:inline-block; background:var(--bg-card); padding:4px 10px; border-radius:10px; margin:4px; font-size:11px; font-weight:bold; color:var(--text-primary); border: 1px solid var(--border-color);">${op}: ${operatorCounts[op]}</span>`; }
        let breakdownDiv = document.getElementById('operatorBreakdown');
        if(!breakdownDiv) { breakdownDiv = document.createElement('div'); breakdownDiv.id = 'operatorBreakdown'; breakdownDiv.style.marginTop = "15px"; breakdownDiv.style.textAlign = "center"; const targetParent = document.querySelector('#blacklistModal .modal-content p:last-of-type').parentNode; if(targetParent) targetParent.appendChild(breakdownDiv); }
        breakdownDiv.innerHTML = breakdownText;
    });
}

function recordStat(type) { const today = new Date().toLocaleDateString('en-CA'); const statRef = db.ref(`stats/hero_sms/${today}/${type}`); statRef.transaction(currentCount => (currentCount || 0) + 1); }
window.openStatsModal = function() { document.getElementById('statsModal').classList.remove('hidden'); const dateInput = document.getElementById('statDate'); if(!dateInput.value) dateInput.value = new Date().toLocaleDateString('en-CA'); loadStatsData(); history.pushState(null, null, "#stats"); }
window.closeStatsModal = function() { document.getElementById('statsModal').classList.add('hidden'); }
function loadStatsData() {
    const selectedDate = document.getElementById('statDate').value; const sSuccess = document.getElementById('statSuccess'); const sFailed = document.getElementById('statFailed');
    if(sSuccess) sSuccess.innerText = "..."; if(sFailed) sFailed.innerText = "...";
    db.ref(`stats/hero_sms/${selectedDate}`).once('value', snap => { const data = snap.val(); if(sSuccess) sSuccess.innerText = data?.success || 0; if(sFailed) sFailed.innerText = data?.failed || 0; });
}
document.getElementById('statDate').addEventListener('change', loadStatsData);

window.openBlacklistModal = function() { document.getElementById('blacklistModal').classList.remove('hidden'); history.pushState(null, null, "#blacklist"); }
window.closeBlacklistModal = function() { document.getElementById('blacklistModal').classList.add('hidden'); }

async function processOrderFreshNumber(operatorId, maxRetries = 5) {
    if (maxRetries <= 0) { showToast("Terlalu banyak stok nomor bekas. Silakan coba lagi.", "error"); return null; }
    const res = await apiCall('/orders/create', 'POST', { operator: operatorId });
    if (res.success && res.data && res.data.orders && res.data.orders.length > 0) {
        const o = res.data.orders[0]; const rawPhone = String(o.phone_number); const phoneStr = normalizePhone(rawPhone);
        if (usedNumbersDB.has(phoneStr)) {
            showToast(`⚠️ Nomor ${rawPhone} bekas. Mencari lagi...`, "warning");
            hiddenBadOrders.push({ id: o.id, cancelAt: Date.now() + (3 * 60 * 1000), isCanceling: false });
            localStorage.setItem(`hero_hidden_bad_orders_${activeAccountName}`, JSON.stringify(hiddenBadOrders));
            return await processOrderFreshNumber(operatorId, maxRetries - 1);
        } else { return o; }
    } else { showToast(res.error ? res.error.message : "Gagal mendapat nomor", "error"); return null; }
}

function loadHistory() { orderHistory = JSON.parse(localStorage.getItem(`hero_history_${activeAccountName}`)) || []; renderHistory(); }
function saveToHistory(order, status) {
    if (!order) return;
    const historyItem = { id: order.id, phone: order.phone, op: order.productId, price: order.price, otp: order.otp || "-", status: status, date: Date.now() };
    orderHistory.unshift(historyItem); if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem(`hero_history_${activeAccountName}`, JSON.stringify(orderHistory)); renderHistory();
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
            ${item.status === 'SUKSES' || item.status === 'MINTA ULANG' ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px; text-shadow: 0 0 10px rgba(150,212,0,0.3);">${item.otp}</div>` : ''}
        `;
        list.appendChild(card);
    });
}
window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); history.pushState(null, null, "#history"); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Hapus semua riwayat pesanan?")) { orderHistory = []; localStorage.removeItem(`hero_history_${activeAccountName}`); renderHistory(); } }

async function fetchAccounts() { try { const res = await fetch(`${BASE_URL}/api/accounts`); const data = await res.json(); if (data.accounts && data.accounts.length > 0) { loginAccount(data.accounts[0]); } else { if(currentAccountName) currentAccountName.innerText = "Tidak ada akun"; showToast("Tidak ada akun", "error"); } } catch (error) { if(currentAccountName) currentAccountName.innerText = "Error Koneksi"; showToast("Gagal terhubung", "error"); } }
function loginAccount(accountName) { activeAccountName = accountName; if(currentAccountName) currentAccountName.innerText = accountName; setAccountViewingStatus(true); const rawOrders = JSON.parse(localStorage.getItem(`hero_orders_${accountName}`)) || []; activeOrders = rawOrders.filter(o => o.expiresAt > Date.now()); if (rawOrders.length !== activeOrders.length) saveToStorage(); hiddenBadOrders = JSON.parse(localStorage.getItem(`hero_hidden_bad_orders_${accountName}`)) || []; loadHistory(); initMainApp(); }

async function fetchBalance() { try { const bDisplay = document.getElementById('balanceDisplay'); if (bDisplay) bDisplay.innerText = "Menghitung..."; const res = await apiCall('/balance'); if (res.success) { if (bDisplay) bDisplay.innerText = usdFormatter.format(res.data.balance); } else { if (bDisplay) bDisplay.innerText = "Gagal"; } } catch (error) { const bDisplay = document.getElementById('balanceDisplay'); if (bDisplay) bDisplay.innerText = "Error"; } }

async function loadShopeeIndonesia() {
    try {
        if (productList) productList.innerHTML = '<div class="status-text-mini">Mencari Operator...</div>';
        const productsRes = await apiCall(`/catalog/products`);
        if (productsRes.success && productsRes.data.length > 0) {
            let ops = productsRes.data; let anyOp = ops.find(o => o.id === 'any'); 
            if (!anyOp) anyOp = { id: 'any', price: ops[0]?.price || 0, available: 'Cek Server' };
            
            let specificOps = ops.filter(o => o.id !== 'any' && o.id !== '' && o.id.toLowerCase() !== 'xl');
            
            if (specificOps.length === 0) {
                const realPrice = anyOp.price; const realStock = anyOp.available; 
                specificOps = [ { id: 'telkomsel', price: realPrice, available: realStock }, { id: 'indosat', price: realPrice, available: realStock }, { id: 'axis', price: realPrice, available: realStock }, { id: 'three', price: realPrice, available: realStock }, { id: 'smartfren', price: realPrice, available: realStock } ];
            } else { specificOps.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)); }
            
            availableProducts = [anyOp, ...specificOps]; 
            if (productList) productList.innerHTML = ''; 
            
            let savedOp = localStorage.getItem('hero_selected_operator');
            let isOpExist = availableProducts.find(p => String(p.id) === String(savedOp));
            selectedProductId = isOpExist ? savedOp : 'any'; 
            localStorage.setItem('hero_selected_operator', selectedProductId);

            if (btnOrder) btnOrder.disabled = false;
            availableProducts.forEach(product => {
                const card = document.createElement("div"); card.className = "product-card"; 
                if (selectedProductId === product.id) card.classList.add('selected');
                
                let opName = product.id === 'any' ? 'Acak' : product.id.toUpperCase();
                let logoImg = getOperatorLogo(product.id); let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
                
                card.innerHTML = `<div class="op-logo-container"><img src="${logoImg}" onerror="this.onerror=null; this.src='${fallbackImg}';" class="op-logo" alt="${opName}"></div><div class="product-info"><h4>${opName}</h4></div><div class="product-price">${usdFormatter.format(product.price)}</div>`;
                
                card.onclick = () => { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); selectedProductId = product.id; localStorage.setItem('hero_selected_operator', product.id); if (btnOrder) btnOrder.disabled = false; };
                if (productList) productList.appendChild(card);
            });
        } else { if (productList) productList.innerHTML = '<div class="status-text-mini">Stok sedang kosong.</div>'; }
    } catch (error) { if (productList) productList.innerHTML = `<div class="status-text-mini" style="color:var(--danger-color);">Error muat data.</div>`; }
}

function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    const now = Date.now();
    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`;
        const isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        let opTag = order.productId;
        if (opTag === 'any' || !opTag) { opTag = getProviderName(order.phone); } else { opTag = String(opTag).toUpperCase(); }
        const matchedProduct = availableProducts.find(p => p.id === order.productId);
        const displayPrice = (order.price && order.price != 0) ? usdFormatter.format(order.price) : usdFormatter.format(matchedProduct?.price || availableProducts[0]?.price || 0);
        const wait = order.cancelUnlockTime - now; 
        let otpHtml = isSuccess ? `<div class="otp-title">KODE OTP</div><div class="otp-code">${formatOTP(order.otp)}</div>` : `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU...</div>`;
        let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";
        
        if (isSuccess) { 
            finishBtnAttr = ""; resendBtnAttr = ""; cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled";
        } else if (wait <= 0 && !order.isAutoCanceling) { 
            cancelBtnAttr = ""; replaceBtnAttr = ""; resendBtnAttr = "disabled"; 
        } else if (order.isAutoCanceling) { 
            cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; resendBtnAttr = "disabled"; 
        }
        
        let headerLogoUrl = getOperatorLogo(opTag); let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
        const left = order.expiresAt - now; let timerColor = "#ffffff"; 
        if (left <= 12 * 60000) { timerColor = "var(--danger-color)"; } else if (left <= 18 * 60000) { timerColor = "var(--warning-color)"; }
        card.innerHTML = `<div class="order-header"><div class="order-info-left" style="display: flex; align-items: center; gap: 10px;"><div style="width: 28px; height: 28px; background: #fff; border-radius: 6px; padding: 3px; display: flex; justify-content: center; align-items: center;"><img src="${headerLogoUrl}" onerror="this.onerror=null; this.src='${fallbackImg}';" style="max-width: 100%; max-height: 100%; object-fit: contain;"></div><div><div class="order-id-label" style="display:inline-block; margin-bottom:2px;">#${order.id}</div><div class="order-price" style="display:block;">${displayPrice}</div></div></div><span class="timer" id="timer-${order.id}" style="color: ${timerColor}; font-weight: 900;">--:--</span></div><div class="phone-row"><span class="phone-number">${formatPhoneNumber(order.phone)}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button></div><div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div><div class="action-buttons-grid"><button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}')" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button><button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button><button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button><button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button></div>`;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        for (let j = hiddenBadOrders.length - 1; j >= 0; j--) {
            let bo = hiddenBadOrders[j];
            if (now >= bo.cancelAt && !bo.isCanceling) {
                bo.isCanceling = true;
                apiCall('/orders/cancel', 'POST', { id: bo.id }).then(res => { hiddenBadOrders.splice(j, 1); localStorage.setItem(`hero_hidden_bad_orders_${activeAccountName}`, JSON.stringify(hiddenBadOrders)); }).catch(e => { bo.isCanceling = false; });
            }
        }
        activeOrders.forEach((o, i) => {
            const left = o.expiresAt - now; const el = document.getElementById(`timer-${o.id}`);
            if (left <= 0) { activeOrders.splice(i, 1); saveToStorage(); fetchBalance(); return; }
            if (el) { const m = Math.floor(left/60000); const s = Math.floor((left%60000)/1000); el.innerText = `${m}:${s<10?'0':''}${s}`; if (left <= 12 * 60000) { el.style.color = "var(--danger-color)"; } else if (left <= 18 * 60000) { el.style.color = "var(--warning-color)"; } else { el.style.color = "#ffffff"; } }
            if (left <= 600000 && o.status !== "OTP_RECEIVED" && !o.isAutoCanceling) { o.isAutoCanceling = true; cancelSpecificOrder(o.id, true); }
            const wait = o.cancelUnlockTime - now; const btnCancel = document.getElementById(`btn-cancel-${o.id}`); const btnReplace = document.getElementById(`btn-replace-${o.id}`); const btnResend = document.getElementById(`btn-resend-${o.id}`); 
            if (o.status !== "OTP_RECEIVED" && !o.isAutoCanceling) {
                if (wait <= 0) { if (btnCancel && btnCancel.disabled) btnCancel.disabled = false; if (btnReplace && btnReplace.disabled && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false; if (btnResend && !btnResend.disabled) btnResend.disabled = true; } 
                else { if (btnCancel && !btnCancel.disabled) btnCancel.disabled = true; if (btnReplace && !btnReplace.disabled) btnReplace.disabled = true; if (btnResend && !btnResend.disabled) btnResend.disabled = true; }
            }
        });
    }, 1000);
    
    // DELAY POLLING KE 10 DETIK MENCEGAH BLOKIR CLOUDFLARE
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) return;
        for(let i=0; i<activeOrders.length; i++) {
            let o = activeOrders[i]; if (o.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/orders/${o.id}`);
                if (res.success && res.data.status === "OTP_RECEIVED") { 
                    notifSound.play().catch(e => console.log("Sound error:", e));
                    activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.otp_code; saveToStorage(); fetchBalance();
                    const phoneStr = normalizePhone(activeOrders[i].phone);
                    if (!usedNumbersDB.has(phoneStr)) { db.ref('used_numbers/hero_sms').push({ phone: pStr, timestamp: Date.now() }); usedNumbersDB.add(phoneStr); }
                } else if (res.success && res.data.status === "CANCELLED") { activeOrders = activeOrders.filter(ord => String(ord.id) !== String(o.id)); saveToStorage(); fetchBalance(); }
            } catch(e) {}
        }
    }, 10000);
}

function removeOrderWithAnimation(idStr, callback) {
    const card = document.getElementById(`order-card-${idStr}`);
    if (card) { card.classList.add('removing'); setTimeout(() => { callback(); }, 300); } else { callback(); }
}

window.cancelSpecificOrder = async function(id, auto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${id}`); 
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerHTML = '<div class="loader"></div>'; }
    
    try { 
        const res = await apiCall('/orders/cancel', 'POST', { id: id }); 
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { 
            const oldOrder = activeOrders.find(o => String(o.id) === String(id)); 
            if (oldOrder) saveToHistory(oldOrder, "BATAL");
            recordStat('failed');

            removeOrderWithAnimation(id, () => {
                activeOrders = activeOrders.filter(o => String(o.id) !== String(id)); 
                saveToStorage(); fetchBalance(); 
                if(auto) showToast("Otomatis dibatalkan", "error"); else showToast("Pesanan dibatalkan", "success");
            });
        } else { 
            showToast("Gagal dibatalkan.", "error"); 
            if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } 
        } 
    } catch (e) { 
        if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } 
    }
};

window.finishSpecificOrder = async function(id) {
    const btnFinish = document.getElementById(`btn-finish-${id}`); 
    if (btnFinish) { btnFinish.disabled = true; btnFinish.innerHTML = '<div class="loader"></div>'; }
    
    const oldOrder = activeOrders.find(o => String(o.id) === String(id)); 
    if (oldOrder) saveToHistory(oldOrder, "SUKSES");
    if (appSettings.autoCopy) { copyToClipboard(appSettings.password); } recordStat('success');
    
    try { await apiCall('/orders/finish', 'POST', { id: id }); } catch (e) {} 
    
    removeOrderWithAnimation(id, () => {
        activeOrders = activeOrders.filter(o => String(o.id) !== String(id)); 
        saveToStorage(); fetchBalance();
    });
};

window.resendSpecificOrder = async function(orderId) {
    const idStr = String(orderId); const btn = document.getElementById(`btn-resend-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const res = await apiCall('/orders/resend', 'POST', { id: idStr });
        if (res.success) { 
            showToast("Meminta kode baru..."); let idx = activeOrders.findIndex(o => String(o.id) === idStr);
            if (idx !== -1) { saveToHistory(activeOrders[idx], "MINTA ULANG"); activeOrders[idx].status = "ACTIVE"; activeOrders[idx].otp = null; saveToStorage(); }
        } else { showToast(res.error ? res.error.message : "Gagal meminta ulang.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
    } catch (e) { showToast("Kesalahan jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

window.replaceSpecificOrder = async function(orderId) {
    if (!isUsedNumbersLoaded) { showToast("Sabar, sinkronisasi database...", "warning"); return; }
    const btn = document.getElementById(`btn-replace-${orderId}`); const oldOrder = activeOrders.find(o => String(o.id) === String(orderId)); const opToUse = oldOrder ? oldOrder.productId : selectedProductId;
    if (!opToUse) return showToast("Pilih operator/server.", "error"); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const c = await apiCall('/orders/cancel', 'POST', { id: orderId });
        if (c.success || (c.error && c.error.code === 'NOT_FOUND')) {
            if (oldOrder) saveToHistory(oldOrder, "GANTI"); recordStat('failed');
            removeOrderWithAnimation(orderId, async () => {
                activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId));
                const n = await apiCall('/orders/create', 'POST', { operator: opToUse });
                if (n.success) {
                    const od = n.data.orders[0]; const pInfo = availableProducts.find(p => String(p.id) === String(opToUse)); const finalPrice = od.price || od.cost || od.amount || (pInfo ? pInfo.price : 0);
                    const expiresAtMs = od.expires_at ? new Date(od.expires_at).getTime() : Date.now() + (20 * 60 * 1000); 
                    activeOrders.unshift({ id: od.id, productId: opToUse, phone: od.phone_number || od.phone, price: finalPrice, otp: null, status: "ACTIVE", expiresAt: expiresAtMs, cancelUnlockTime: Date.now() + (120*1000), isAutoCanceling: false });
                    saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(od.phone_number || od.phone); showToast("Nomor diganti!");
                } else { saveToStorage(); fetchBalance(); showToast("Gagal pesan baru.", "error"); }
            });
        } else { showToast("Gagal batal lama.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
    } catch (e) { showToast("Error Jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

async function initMainApp() { fetchBalance(); await loadShopeeIndonesia(); renderOrders(); startPollingAndTimer(); }

window.onload = () => { relocateBalanceUI(); setAccountViewingStatus(false); history.pushState(null, null, window.location.href); initUsedNumbersSync(); fetchAccounts(); renderMainButtons(); };
