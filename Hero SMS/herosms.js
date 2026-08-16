const BASE_URL = "https://hero-sms-proxy.masreno6pro.workers.dev"; 

const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); 

let appSettings = JSON.parse(localStorage.getItem('app_settings')) || { password: "Aku123..", autoCopy: true };
let viewingPresenceRef = null; let activeAccountName = null; let activeOrders = []; 
let allServices = []; let availableProducts = []; 
let currentServiceId = null; let selectedProductId = 'any'; 
let timerInterval = null; let orderHistory = [];
let activeWebhookListeners = {}; 
let usedNumbersDB = new Set(); let hiddenBadOrders = []; let isUsedNumbersLoaded = false; 
let isDroplistOpen = false; 

let favoriteServices = JSON.parse(localStorage.getItem('hero_favorite_services')) || ["ka"];
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

const currentAccountName = document.getElementById('currentAccountName'); const productList = document.getElementById('productList'); const activeOrdersContainer = document.getElementById('activeOrdersContainer'); const activeCount = document.getElementById('activeCount'); const balanceDisplay = document.getElementById('balanceDisplay'); const exitModal = document.getElementById('exitModal'); 

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

async function apiCall(endpoint, method = "GET", body = null) { 
    const options = { method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } }; 
    if (body) options.body = JSON.stringify(body); 
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, options); 
        const textData = await response.text();
        try { return JSON.parse(textData); } catch (err) {
            let lowerText = textData.toLowerCase();
            if (lowerText.includes("<html") || lowerText.includes("cloudflare") || lowerText.includes("blocked")) { return { success: false, error: { message: "Akses diblokir (Cloudflare)." } }; }
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
function getProviderName(phone) { let p = String(phone); if (p.startsWith("62")) p = "0" + p.substring(2); const prefix = p.substring(0, 4); if (['0811','0812','0813','0821','0822','0852','0853','0851'].includes(prefix)) return "Telkomsel"; if (['0814','0815','0816','0855','0856','0857','0858'].includes(prefix)) return "Indosat"; if (['0817','0818','0819','0859','0877','0878','0838','0831','0832','0833'].includes(prefix)) return "XL"; if (['0895','0896','0897','0898','0899'].includes(prefix)) return "Three"; if (['0881','0882','0883','0884','0885','0886','0887','0888','0889'].includes(prefix)) return "Smartfren"; return "Acak"; }

function getOperatorLogo(id) { 
    const i = String(id).toLowerCase(); 
    if (i.includes('telkomsel')) return 'https://assets.telkomsel.com/public/app-logo/2021-06/telkomsel-logo.png'; 
    if (i.includes('indosat') || i.includes('isat') || i.includes('im3')) return 'https://im3-img.indosatooredoo.com/indosatassets/images/myim3_app_footer.svg'; 
    if (i.includes('xl')) return 'https://iconlogovector.com/uploads/images/2024/09/lg-66ef50c24df06-XL-Axiata-operator-telekomunik.webp'; 
    if (i.includes('axis')) return 'https://www.axis.co.id/img/common/logo.svg'; 
    if (i.includes('three') || i.includes('tri')) return 'https://www.three.co.uk/content/dam/threedigital/static-files/components/header/three-logo.svg'; 
    if (i.includes('smartfren')) return 'https://down-id.img.susercontent.com/file/id-11134207-8224s-mkkmirlvdurn5d@resize_w900_nl.webp'; 
    return 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png'; 
}

let isExitModalOpen = false;
window.addEventListener('popstate', (e) => {
    let mods = ['blacklistModal', 'historyModal', 'statsModal', 'settingsModal', 'serviceModal', 'iframeNoteModal']; 
    let closedAny = false;
    mods.forEach(m => { let el = document.getElementById(m); if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); closedAny = true; } });
    if (closedAny) { history.pushState(null, null, window.location.href); return; }
    if (isExitModalOpen) { closeExitModal(); history.pushState(null, null, window.location.href); }
    else { exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
});

function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() { setAccountViewingStatus(false); window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }
function saveToStorage() { localStorage.setItem(`hero_orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }
function showToast(pesan, type = "success") { const t = document.getElementById("toast"); if(!t) return; t.innerHTML = pesan; if (type === "error") { t.style.backgroundColor = "var(--danger-color)"; t.style.color = "#ffffff"; } else if (type === "warning") { t.style.backgroundColor = "var(--warning-color)"; t.style.color = "#000000"; } else { t.style.backgroundColor = "var(--success-color)"; t.style.color = "#000"; } t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 4000); }
function copyToClipboard(t) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(t); }); } else { copyFallback(t); } }
function copyFallback(t) { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } document.body.removeChild(ta); }
function setAccountViewingStatus(isViewing) { if (!activeAccountName) return; if (isViewing) { const connectedRef = db.ref('.info/connected'); viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`); connectedRef.on('value', (snap) => { if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); } }); } else { if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); } } }
function updateAccountOrdersStatus() { if (!activeAccountName) return; db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0); }
function relocateBalanceUI() { const headerContainer = document.querySelector('.app-header-container'); const balanceContainer = document.querySelector('.balance-container'); if(headerContainer && balanceContainer && !document.getElementById('newBalanceDisplay')) { balanceContainer.style.display = 'none'; const newBalanceDiv = document.createElement('div'); newBalanceDiv.style.textAlign = 'right'; newBalanceDiv.innerHTML = `<span style="font-size: 10px; color: var(--text-secondary); font-weight: bold; text-transform: uppercase; display: block;">Saldo</span><span id="newBalanceDisplay" style="font-size: 16px; font-weight: 900; color: var(--primary-color);">...</span>`; headerContainer.appendChild(newBalanceDiv); const oldBalance = document.getElementById('balanceDisplay'); if(oldBalance) oldBalance.removeAttribute('id'); newBalanceDiv.querySelector('span:last-child').id = 'balanceDisplay'; } }

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

async function fetchBalance() { 
    try { 
        const bDisplay = document.getElementById('balanceDisplay'); 
        if (bDisplay) bDisplay.innerText = "Menghitung..."; 
        const res = await apiCall('/balance'); 
        if (res.success) { 
            if (bDisplay) bDisplay.innerText = usdFormatter.format(res.data.balance); 
        } else { 
            if (bDisplay) bDisplay.innerText = "Gagal"; 
            if (res.error && res.error.message) { showToast("Saldo: " + res.error.message, "error"); }
        } 
    } catch (error) { 
        const bDisplay = document.getElementById('balanceDisplay'); 
        if (bDisplay) bDisplay.innerText = "Error"; 
    } 
}

window.refreshStock = function() {
    const btn = document.getElementById('btnRefreshStock');
    if(btn) {
        const icon = btn.querySelector('i');
        icon.classList.add('fa-spin');
        setTimeout(() => icon.classList.remove('fa-spin'), 1000);
    }
    if (currentServiceId) {
        loadProducts(currentServiceId);
        fetchBalance(); 
    }
};

async function loadServices() {
    const btnSvc = document.getElementById('btnServiceSelect');
    if (!btnSvc) return;
    try {
        btnSvc.innerHTML = `<span>Memuat...</span><i class="fas fa-spinner fa-spin"></i>`;
        const servicesRes = await apiCall(`/catalog/services`);
        if (servicesRes.success && servicesRes.data) {
            allServices = servicesRes.data; 
            allServices.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            let savedId = localStorage.getItem('hero_selected_service') || "ka"; 
            let exists = allServices.find(s => String(s.id) === String(savedId));
            let selectedSvc = exists ? exists : allServices[0];
            currentServiceId = selectedSvc.id; 
            localStorage.setItem('hero_selected_service', currentServiceId); 
            btnSvc.innerHTML = `<span>${selectedSvc.name.toUpperCase()}</span><i class="fas fa-search" style="font-size: 11px;"></i>`;
            loadProducts(currentServiceId);
        } else {
            btnSvc.innerHTML = `<span style="color:var(--danger-color);">Error</span><i class="fas fa-exclamation-triangle"></i>`;
        }
    } catch (e) { btnSvc.innerHTML = `<span style="color:var(--danger-color);">Gagal</span><i class="fas fa-wifi"></i>`; }
}

window.openServiceModal = function() { document.getElementById('serviceModal').classList.remove('hidden'); document.getElementById('searchServiceInput').value = ''; filterServices(); history.pushState(null, null, "#services"); }
window.closeServiceModal = function() { document.getElementById('serviceModal').classList.add('hidden'); }

window.filterServices = function() {
    const query = document.getElementById('searchServiceInput').value.toLowerCase();
    const container = document.getElementById('serviceListContainer');
    container.innerHTML = '';
    
    const filtered = allServices.filter(s => (s.name || s.id).toLowerCase().includes(query));
    if(filtered.length === 0) { container.innerHTML = '<div class="status-text-mini" style="margin-top:10px;">Layanan tidak ditemukan.</div>'; return; }

    let favs = []; let others = [];
    filtered.forEach(svc => { if (favoriteServices.includes(svc.id)) favs.push(svc); else others.push(svc); });

    const renderBtn = (svc, isFav) => {
        const isActive = (String(svc.id) === String(currentServiceId));
        const btn = document.createElement('div');
        btn.style = `width: 100%; padding: 12px 14px; border-radius: 10px; font-size: 13px; font-weight: bold; text-align: left; display: flex; align-items: center; justify-content: space-between; border: 2px solid ${isActive ? 'var(--primary-color)' : 'var(--border-color)'}; background: ${isActive ? 'var(--bg-body)' : 'var(--bg-card)'}; color: ${isActive ? 'var(--primary-color)' : 'var(--text-primary)'}; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.15); margin-bottom: 6px;`;
        btn.innerHTML = `<div style="display:flex; align-items:center; flex:1;" onclick="selectService('${svc.id}', '${(svc.name||svc.id).replace(/'/g, "\\'")}')"><span>${(svc.name||svc.id).toUpperCase()}</span></div><div style="display:flex; align-items:center; gap:12px;">${isActive ? '<i class="fas fa-check-circle" style="color:var(--primary-color);"></i>' : ''}<i class="fas fa-star" style="font-size:16px; color:${isFav ? 'var(--warning-color)' : 'var(--text-secondary)'}; text-shadow: ${isFav ? '0 0 8px rgba(245, 158, 11, 0.5)' : 'none'}; cursor:pointer; padding:4px;" onclick="toggleFavorite('${svc.id}', event)"></i></div>`;
        return btn;
    };

    if (favs.length > 0) {
        const favTitle = document.createElement('div'); favTitle.style = "font-size: 10px; font-weight: 900; color: var(--warning-color); margin-top: 5px; margin-bottom: 8px; letter-spacing: 1px;"; favTitle.innerText = "⭐️ FAVORIT"; container.appendChild(favTitle);
        favs.forEach(svc => container.appendChild(renderBtn(svc, true)));
    }

    if (others.length > 0) {
        const othTitle = document.createElement('div'); othTitle.style = "font-size: 10px; font-weight: 900; color: var(--text-secondary); margin-top: 10px; margin-bottom: 8px; letter-spacing: 1px;"; othTitle.innerText = "SEMUA LAYANAN"; container.appendChild(othTitle);
        others.forEach(svc => container.appendChild(renderBtn(svc, false)));
    }
}

window.selectService = function(id, name) {
    currentServiceId = id; localStorage.setItem('hero_selected_service', currentServiceId);
    const btnSvc = document.getElementById('btnServiceSelect');
    if (btnSvc) btnSvc.innerHTML = `<span>${name.toUpperCase()}</span><i class="fas fa-search" style="font-size: 11px;"></i>`;
    closeServiceModal(); loadProducts(currentServiceId);
}

window.toggleFavorite = function(id, event) {
    event.stopPropagation();
    if (favoriteServices.includes(id)) { favoriteServices = favoriteServices.filter(f => f !== id); } else { favoriteServices.push(id); }
    localStorage.setItem('hero_favorite_services', JSON.stringify(favoriteServices)); filterServices(); 
}

async function loadProducts(serviceId) {
    try {
        if (productList) productList.innerHTML = '<div class="status-text-mini">Mencari Server...</div>';
        const btnOrder = document.getElementById('btnOrder');
        if (btnOrder) btnOrder.disabled = true;

        const productsRes = await apiCall(`/catalog/products?service=${serviceId}`);
        if (productsRes.error && productsRes.error.message) { showToast("Server: " + productsRes.error.message, "error"); }

        if (productsRes.success && productsRes.data.length > 0) {
            let opsList = productsRes.data; 
            let anyOp = opsList.find(o => o.id === 'any') || { id: 'any', price: opsList[0]?.price || 0 };
            
            const standardOps = ['telkomsel', 'indosat', 'xl', 'axis', 'three', 'smartfren'];
            
            let specificOps = standardOps.map(opId => {
                let apiOpId = (opId === 'xl') ? 'axis' : opId;
                let found = opsList.find(o => o.id === apiOpId);
                return { id: opId, price: found ? found.price : anyOp.price }; 
            });
            
            opsList.forEach(o => {
                if (o.id !== 'any' && o.id !== '' && !standardOps.includes(o.id)) {
                    specificOps.push({ id: o.id, price: o.price });
                }
            });
            
            availableProducts = [anyOp, ...specificOps]; 
            if (productList) productList.innerHTML = ''; 
            
            let savedOp = localStorage.getItem('hero_selected_operator') || 'any';
            const chkRandom = document.getElementById('chkRandomOp'); 
            
            let isOpExist = availableProducts.find(p => String(p.id) === String(savedOp));
            selectedProductId = isOpExist ? savedOp : 'any'; 
            localStorage.setItem('hero_selected_operator', selectedProductId);

            if (chkRandom) chkRandom.checked = (selectedProductId === 'any');
            if (btnOrder) btnOrder.disabled = false;
            
            specificOps.forEach(product => {
                let opCode = product.id; let opName = opCode.toUpperCase();
                const card = document.createElement("div"); 
                card.className = "product-card"; 
                card.id = `op-card-${opCode}`;
                
                if (selectedProductId === String(opCode)) { card.classList.add('selected'); }
                
                let logoImg = getOperatorLogo(opCode); let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
                card.innerHTML = `<div class="op-logo-container"><img src="${logoImg}" onerror="this.onerror=null; this.src='${fallbackImg}';" class="op-logo" alt="${opName}"></div><div class="product-info"><h4>${opName}</h4></div><div class="product-price">${usdFormatter.format(product.price)}</div>`;
                
                card.onclick = () => { 
                    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); 
                    card.classList.add('selected'); 
                    if (chkRandom) chkRandom.checked = false;
                    selectedProductId = String(opCode); 
                    localStorage.setItem('hero_selected_operator', selectedProductId); 
                    if (btnOrder) btnOrder.disabled = false; 
                };
                if (productList) productList.appendChild(card);
            });
        } else { if (productList) productList.innerHTML = '<div class="status-text-mini">Stok sedang kosong.</div>'; }
    } catch (error) { if (productList) productList.innerHTML = `<div class="status-text-mini" style="color:var(--danger-color);">Error muat data.</div>`; }
}

window.toggleRandomOperator = function() {
    const chk = document.getElementById('chkRandomOp');
    if (chk.checked) { 
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); 
        selectedProductId = 'any'; 
        localStorage.setItem('hero_selected_operator', 'any'); 
    } else { 
        let nextAvail = availableProducts.find(p => p.id !== 'any');
        if (nextAvail) { 
            selectedProductId = String(nextAvail.id); 
            document.getElementById(`op-card-${nextAvail.id}`).classList.add('selected'); 
            localStorage.setItem('hero_selected_operator', selectedProductId); 
        } 
    }
    const btn = document.getElementById('btnOrder');
    if (btn) btn.disabled = false;
}

async function processOrderFreshNumber(operatorId, serviceIdParam, maxRetries = 5) {
    if (maxRetries <= 0) { showToast("Terlalu banyak stok nomor bekas.", "error"); return null; }
    
    let apiOperatorId = (operatorId === 'xl') ? 'axis' : operatorId;
    const targetSvc = serviceIdParam || currentServiceId;
    
    const res = await apiCall('/orders/create', 'POST', { operator: apiOperatorId, service: targetSvc });
    
    if (res.success && res.data && res.data.orders && res.data.orders.length > 0) {
        const o = res.data.orders[0]; const rawPhone = String(o.phone_number); const phoneStr = normalizePhone(rawPhone);
        if (usedNumbersDB.has(phoneStr)) {
            showToast(`⚠️ Nomor ${rawPhone} bekas. Mencari lagi...`, "warning");
            hiddenBadOrders.push({ id: o.id, cancelAt: Date.now() + (3 * 60 * 1000), isCanceling: false });
            localStorage.setItem(`hero_hidden_bad_orders_${activeAccountName}`, JSON.stringify(hiddenBadOrders));
            return await processOrderFreshNumber(operatorId, targetSvc, maxRetries - 1);
        } else { return o; }
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
    
    btn.disabled = true; const originalText = btn.innerText; btn.innerText = "Memproses...";
    
    try {
        const o = await processOrderFreshNumber(selectedProductId, currentServiceId, 5); 
        if (o) {
            const opInfo = availableProducts.find(p => String(p.id) === String(selectedProductId)); 
            const opPrice = o.price || (opInfo ? opInfo.price : 0);
            
            const svcObj = allServices.find(s => String(s.id) === String(currentServiceId));
            const sName = svcObj ? svcObj.name : "SHOPEE";
            
            activeOrders.unshift({ 
                id: o.id, 
                productId: selectedProductId, 
                serviceId: currentServiceId,
                serviceName: sName,
                phone: o.phone_number, 
                price: opPrice, 
                otp: null, 
                status: "ACTIVE", 
                expiresAt: Date.now() + (20 * 60 * 1000), 
                cancelUnlockTime: Date.now() + 120000, 
                isAutoCanceling: false,
                disableAutoCancel: false
            });
            
            isDroplistOpen = false;
            saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(o.phone_number); window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (e) { showToast("Terjadi kesalahan teknis.", "error"); }
    btn.disabled = false; btn.innerText = originalText;
};

window.toggleDroplist = function() { isDroplistOpen = !isDroplistOpen; renderOrders(); };

function createOrderCard(order) {
    const now = Date.now(); const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`;
    const isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
    
    let opTag = order.productId;
    if (opTag === 'any' || !opTag) { opTag = getProviderName(order.phone); } else { opTag = String(opTag).toUpperCase(); }
    
    let srvName = order.serviceName ? String(order.serviceName).toUpperCase() : "SHOPEE";
    
    const matchedProduct = availableProducts.find(p => p.id === order.productId);
    const displayPrice = (order.price && order.price > 0) ? usdFormatter.format(order.price) : usdFormatter.format(matchedProduct?.price || 0);
    const wait = order.cancelUnlockTime - now; 
    
    // PERBAIKAN: Tombol Salin OTP dikunci dengan lebar absolut tanpa menggeser elemen
    let otpHtml = isSuccess 
        ? `<div class="otp-title">KODE OTP</div><div class="otp-code" style="margin:0 !important; letter-spacing: 4px !important;">${formatOTP(order.otp)}</div><button class="btn-copy" onclick="copyToClipboard('${order.otp}')" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #000000; color: #ffcc00; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-copy"></i></button>` 
        : `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU...</div>`;
        
    let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";
    if (isSuccess) { finishBtnAttr = ""; resendBtnAttr = ""; cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; } else if (wait <= 0 && !order.isAutoCanceling) { cancelBtnAttr = ""; replaceBtnAttr = ""; resendBtnAttr = "disabled"; } else if (order.isAutoCanceling) { cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; resendBtnAttr = "disabled"; }
    
    let headerLogoUrl = getOperatorLogo(opTag); let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
    const left = order.expiresAt - now; let timerColor = "#ffffff"; if (left <= 12 * 60000) { timerColor = "var(--danger-color)"; } else if (left <= 18 * 60000) { timerColor = "var(--warning-color)"; }
    
    card.innerHTML = `<div class="order-header"><div class="order-info-left" style="display: flex; align-items: center; gap: 10px;"><div style="width: 28px; height: 28px; background: #fff; border-radius: 6px; padding: 3px; display: flex; justify-content: center; align-items: center;"><img src="${headerLogoUrl}" onerror="this.onerror=null; this.src='${fallbackImg}';" style="max-width: 100%; max-height: 100%; object-fit: contain;"></div><div><div class="order-id-label" style="display:inline-block; margin-bottom:2px; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom;">#${order.id} (${srvName} • ${opTag})</div><div class="order-price" style="display:block;">${displayPrice}</div></div></div><span class="timer" id="timer-${order.id}" style="color: ${timerColor}; font-weight: 900;">--:--</span></div><div class="phone-row"><span class="phone-number">${formatPhoneNumber(order.phone)}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button></div><div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div><div class="action-buttons-grid"><button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}')" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button><button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button><button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button><button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button></div>`;
    return card;
}

function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; isDroplistOpen = false; return; }
    
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    activeOrdersContainer.appendChild(createOrderCard(activeOrders[0]));

    if (activeOrders.length > 1) {
        const oldOrdersCount = activeOrders.length - 1;
        const wrapper = document.createElement("div"); wrapper.className = "old-orders-wrapper";
        const btnToggle = document.createElement("button"); btnToggle.className = `btn-droplist ${isDroplistOpen ? 'open' : ''}`; btnToggle.innerHTML = `<span><i class="fas fa-history"></i> Lihat ${oldOrdersCount} Pesanan Lama</span> <i class="fas fa-chevron-${isDroplistOpen ? 'up' : 'down'}"></i>`; btnToggle.onclick = toggleDroplist; wrapper.appendChild(btnToggle);
        const content = document.createElement("div"); content.className = `old-orders-content ${isDroplistOpen ? 'show' : ''}`;
        
        const btnCancelAll = document.createElement("button"); btnCancelAll.className = "btn-cancel-all"; btnCancelAll.id = "btn-cancel-all-old";
        let hasCancellableOldOrders = false; const now = Date.now();
        for(let i=1; i < activeOrders.length; i++) { if (now >= activeOrders[i].cancelUnlockTime) { hasCancellableOldOrders = true; break; } }
        
        if (hasCancellableOldOrders) { btnCancelAll.innerHTML = `<i class="fas fa-trash-alt"></i> Batalkan Semua Pesanan Lama`; btnCancelAll.onclick = cancelAllOldOrders; } else { btnCancelAll.innerHTML = `<i class="fas fa-clock"></i> Batalkan Semua (Tunggu 2 Menit)`; btnCancelAll.disabled = true; btnCancelAll.style.opacity = "0.5"; btnCancelAll.style.cursor = "not-allowed"; }
        content.appendChild(btnCancelAll);

        for (let i = 1; i < activeOrders.length; i++) { content.appendChild(createOrderCard(activeOrders[i])); }
        wrapper.appendChild(content); activeOrdersContainer.appendChild(wrapper);
    }
}

window.cancelAllOldOrders = async function() {
    if (activeOrders.length <= 1) return;
    const now = Date.now(); const oldOrders = activeOrders.slice(1).filter(o => now >= o.cancelUnlockTime);
    if (oldOrders.length === 0) { showToast("Belum ada pesanan lama yang melewati 2 menit.", "warning"); return; }
    
    const btnAll = document.getElementById("btn-cancel-all-old");
    if(btnAll) { btnAll.disabled = true; btnAll.innerHTML = '<div class="loader" style="border-top-color:var(--danger-color);"></div>'; }
    showToast(`Membatalkan ${oldOrders.length} pesanan lama...`, "warning");
    
    let cancelledCount = 0;
    for (const order of oldOrders) {
        const btn = document.getElementById(`btn-cancel-${order.id}`); if(btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
        try {
            const res = await apiCall('/orders/cancel', 'POST', { id: parseInt(order.id) });
            if (res.success || (res.error && res.error.code === 'NOT_FOUND')) {
                saveToHistory(order, "BATAL"); recordStat('failed'); activeOrders = activeOrders.filter(o => String(o.id) !== String(order.id));
                if (activeWebhookListeners[order.id]) { db.ref(`hero_sms_webhooks/${order.id}`).off(); db.ref(`hero_sms_webhooks/${order.id}`).remove(); delete activeWebhookListeners[order.id]; }
                cancelledCount++;
            }
        } catch(e) {}
    }
    saveToStorage(); fetchBalance();
    if (cancelledCount > 0) showToast(`${cancelledCount} pesanan lama dibatalkan.`, "success");
    if (activeOrders.length <= 1) isDroplistOpen = false;
    renderOrders();
};

function manageFirebaseListeners() {
    activeOrders.forEach(o => {
        if (o.status !== "OTP_RECEIVED" && !activeWebhookListeners[o.id]) {
            activeWebhookListeners[o.id] = true;
            const ref = db.ref(`hero_sms_webhooks/${o.id}`);
            ref.on('value', snapshot => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    let idx = activeOrders.findIndex(ord => String(ord.id) === String(o.id));
                    if (idx !== -1 && activeOrders[idx].status !== "OTP_RECEIVED") {
                        notifSound.play().catch(e=>console.log(e));
                        activeOrders[idx].status = "OTP_RECEIVED"; activeOrders[idx].otp = data.code; saveToStorage(); fetchBalance();
                        const phoneStr = normalizePhone(activeOrders[idx].phone);
                        if (!usedNumbersDB.has(phoneStr)) { db.ref('used_numbers/hero_sms').push({ phone: phoneStr, timestamp: Date.now() }); usedNumbersDB.add(phoneStr); }
                    }
                }
            });
        }
    });
}

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    manageFirebaseListeners(); 

    timerInterval = setInterval(() => {
        const now = Date.now();
        for (let j = hiddenBadOrders.length - 1; j >= 0; j--) {
            let bo = hiddenBadOrders[j];
            if (now >= bo.cancelAt && !bo.isCanceling) { bo.isCanceling = true; apiCall('/orders/cancel', 'POST', { id: bo.id }).then(res => { hiddenBadOrders.splice(j, 1); localStorage.setItem(`hero_hidden_bad_orders_${activeAccountName}`, JSON.stringify(hiddenBadOrders)); }).catch(e => { bo.isCanceling = false; }); }
        }
        
        let hasCancellableOldOrders = false;
        activeOrders.forEach((o, i) => {
            const left = o.expiresAt - now; const el = document.getElementById(`timer-${o.id}`);
            if (left <= 0) { activeOrders.splice(i, 1); saveToStorage(); fetchBalance(); return; }
            if (el) { const m = Math.floor(left/60000); const s = Math.floor((left%60000)/1000); el.innerText = `${m}:${s<10?'0':''}${s}`; if (left <= 12 * 60000) { el.style.color = "var(--danger-color)"; } else if (left <= 18 * 60000) { el.style.color = "var(--warning-color)"; } else { el.style.color = "#ffffff"; } }
            
            if (left <= 600000 && o.status !== "OTP_RECEIVED" && !o.isAutoCanceling && !o.disableAutoCancel) { o.isAutoCanceling = true; cancelSpecificOrder(o.id, true); }
            
            const wait = o.cancelUnlockTime - now; 
            const btnCancel = document.getElementById(`btn-cancel-${o.id}`); const btnReplace = document.getElementById(`btn-replace-${o.id}`); const btnResend = document.getElementById(`btn-resend-${o.id}`); 
            
            if (o.status !== "OTP_RECEIVED" && !o.isAutoCanceling) {
                if (wait <= 0) { 
                    if (btnCancel && btnCancel.disabled) btnCancel.disabled = false; if (btnReplace && btnReplace.disabled && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false; if (btnResend && !btnResend.disabled) btnResend.disabled = true; 
                    if (i > 0) hasCancellableOldOrders = true;
                } else { 
                    if (btnCancel && !btnCancel.disabled) btnCancel.disabled = true; if (btnReplace && !btnReplace.disabled) btnReplace.disabled = true; if (btnResend && !btnResend.disabled) btnResend.disabled = true; 
                }
            }
        });
        
        const btnCancelAll = document.getElementById("btn-cancel-all-old");
        if (btnCancelAll && !btnCancelAll.innerHTML.includes('loader')) {
            if (hasCancellableOldOrders) {
                if(btnCancelAll.disabled) { btnCancelAll.innerHTML = `<i class="fas fa-trash-alt"></i> Batalkan Semua Pesanan Lama`; btnCancelAll.disabled = false; btnCancelAll.style.opacity = "1"; btnCancelAll.style.cursor = "pointer"; btnCancelAll.onclick = cancelAllOldOrders; }
            } else {
                if(!btnCancelAll.disabled) { btnCancelAll.innerHTML = `<i class="fas fa-clock"></i> Batalkan Semua (Tunggu 2 Menit)`; btnCancelAll.disabled = true; btnCancelAll.style.opacity = "0.5"; btnCancelAll.style.cursor = "not-allowed"; btnCancelAll.onclick = null; }
            }
        }
        manageFirebaseListeners(); 
    }, 1000);
}

function removeOrderWithAnimation(idStr, callback) {
    if (activeWebhookListeners[idStr]) { db.ref(`hero_sms_webhooks/${idStr}`).off(); db.ref(`hero_sms_webhooks/${idStr}`).remove(); delete activeWebhookListeners[idStr]; }
    const card = document.getElementById(`order-card-${idStr}`); if (card) { card.classList.add('removing'); setTimeout(() => { callback(); }, 300); } else { callback(); }
}

window.cancelSpecificOrder = async function(id, auto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${id}`); if (btnCancel) { btnCancel.disabled = true; btnCancel.innerHTML = '<div class="loader"></div>'; }
    try { 
        const res = await apiCall('/orders/cancel', 'POST', { id: parseInt(id) }); 
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { 
            const oldOrder = activeOrders.find(o => String(o.id) === String(id)); if (oldOrder) saveToHistory(oldOrder, "BATAL"); recordStat('failed');
            removeOrderWithAnimation(id, () => { activeOrders = activeOrders.filter(o => String(o.id) !== String(id)); saveToStorage(); fetchBalance(); if (activeOrders.length <= 1) isDroplistOpen = false; if(auto) showToast("Otomatis dibatalkan", "error"); else showToast("Pesanan dibatalkan", "success"); renderOrders(); });
        } else { showToast("Gagal dibatalkan.", "error"); if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } } 
    } catch (e) { if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } }
};

window.finishSpecificOrder = async function(id) {
    const btnFinish = document.getElementById(`btn-finish-${id}`); if (btnFinish) { btnFinish.disabled = true; btnFinish.innerHTML = '<div class="loader"></div>'; }
    const now = Date.now(); const isNewest = (activeOrders.length > 0 && String(activeOrders[0].id) === String(id));
    const oldOrdersToCancel = isNewest ? activeOrders.slice(1).filter(o => now >= o.cancelUnlockTime) : [];
    const oldOrder = activeOrders.find(o => String(o.id) === String(id)); if (oldOrder) saveToHistory(oldOrder, "SUKSES");
    if (appSettings.autoCopy) { copyToClipboard(appSettings.password); } recordStat('success');
    try { await apiCall('/orders/finish', 'POST', { id: parseInt(id) }); } catch (e) {} 
    
    removeOrderWithAnimation(id, async () => { 
        activeOrders = activeOrders.filter(o => String(o.id) !== String(id)); saveToStorage(); fetchBalance(); 
        if (isNewest && oldOrdersToCancel.length > 0) {
            showToast(`Menyapu ${oldOrdersToCancel.length} pesanan lama otomatis...`, "warning");
            for (let o of oldOrdersToCancel) {
                try { 
                    const res = await apiCall('/orders/cancel', 'POST', { id: parseInt(o.id) }); 
                    if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { saveToHistory(o, "BATAL"); recordStat('failed'); activeOrders = activeOrders.filter(x => String(x.id) !== String(o.id)); if (activeWebhookListeners[o.id]) { db.ref(`hero_sms_webhooks/${o.id}`).off(); db.ref(`hero_sms_webhooks/${o.id}`).remove(); delete activeWebhookListeners[o.id]; } }
                } catch(e){}
            }
            saveToStorage(); fetchBalance(); if (activeOrders.length <= 1) isDroplistOpen = false; renderOrders();
        } else { if (activeOrders.length <= 1) isDroplistOpen = false; renderOrders(); }
    });
};

window.resendSpecificOrder = async function(orderId) {
    const idStr = String(orderId); const btn = document.getElementById(`btn-resend-${idStr}`); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const res = await apiCall('/orders/resend', 'POST', { id: parseInt(orderId) });
        if (res.success) { 
            showToast("Meminta kode baru..."); db.ref(`hero_sms_webhooks/${idStr}`).remove(); 
            let idx = activeOrders.findIndex(o => String(o.id) === idStr);
            if (idx !== -1) { saveToHistory(activeOrders[idx], "MINTA ULANG"); activeOrders[idx].status = "ACTIVE"; activeOrders[idx].otp = null; activeOrders[idx].disableAutoCancel = true; saveToStorage(); }
        } else { showToast(res.error ? res.error.message : "Gagal meminta ulang.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
    } catch (e) { showToast("Kesalahan jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

window.replaceSpecificOrder = async function(orderId) {
    if (!isUsedNumbersLoaded) { showToast("Sabar, sinkronisasi database...", "warning"); return; }
    const btn = document.getElementById(`btn-replace-${orderId}`); 
    const oldOrder = activeOrders.find(o => String(o.id) === String(orderId)); 
    const opToUse = oldOrder ? oldOrder.productId : selectedProductId;
    
    const srvIdToUse = oldOrder ? (oldOrder.serviceId || currentServiceId) : currentServiceId;
    const srvNameToUse = oldOrder ? (oldOrder.serviceName || "SHOPEE") : "SHOPEE";
    
    if (!opToUse) return showToast("Pilih operator/server.", "error"); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    
    try {
        const c = await apiCall('/orders/cancel', 'POST', { id: parseInt(orderId) });
        if (c.success || (c.error && c.error.code === 'NOT_FOUND')) {
            if (oldOrder) saveToHistory(oldOrder, "GANTI"); recordStat('failed');
            removeOrderWithAnimation(orderId, async () => {
                activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId));
                const n = await processOrderFreshNumber(opToUse, srvIdToUse, 5);
                if (n) {
                    const pInfo = availableProducts.find(p => String(p.id) === String(opToUse)); 
                    const finalPrice = n.price || (pInfo ? pInfo.price : 0);
                    const expiresAtMs = n.expires_at ? new Date(n.expires_at).getTime() : Date.now() + (20 * 60 * 1000); 
                    
                    activeOrders.unshift({ 
                        id: n.id, 
                        productId: opToUse, 
                        serviceId: srvIdToUse,
                        serviceName: srvNameToUse,
                        phone: n.phone_number || n.phone, 
                        price: finalPrice, 
                        otp: null, 
                        status: "ACTIVE", 
                        expiresAt: expiresAtMs, 
                        cancelUnlockTime: Date.now() + (120*1000), 
                        isAutoCanceling: false, 
                        disableAutoCancel: false 
                    });
                    
                    isDroplistOpen = false; 
                    saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(n.phone_number || n.phone); showToast("Nomor diganti!");
                } else { saveToStorage(); fetchBalance(); renderOrders(); }
            });
        } else { showToast("Gagal batal lama.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
    } catch (e) { showToast("Error Jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

function loadHistory() { orderHistory = JSON.parse(localStorage.getItem(`hero_history_${activeAccountName}`)) || []; renderHistory(); }

function saveToHistory(order, status) { 
    if (!order) return; 
    const historyItem = { 
        id: order.id, 
        phone: order.phone, 
        op: order.productId, 
        serviceName: order.serviceName || "SHOPEE",
        price: order.price, 
        otp: order.otp || "-", 
        status: status, 
        date: Date.now() 
    }; 
    orderHistory.unshift(historyItem); 
    if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem(`hero_history_${activeAccountName}`, JSON.stringify(orderHistory)); 
    renderHistory(); 
}

function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    if (orderHistory.length === 0) { list.innerHTML = '<div class="status-text-mini" style="text-align:center;">Belum ada riwayat.</div>'; return; } list.innerHTML = "";
    orderHistory.forEach(item => {
        const card = document.createElement('div'); card.style.background = "var(--bg-card)"; card.style.padding = "10px"; card.style.borderRadius = "10px"; card.style.border = "1px solid var(--border-color)"; card.style.fontSize = "11px";
        let statusColor = "var(--text-secondary)"; let icon = "fa-clock";
        if (item.status === "SUKSES") { statusColor = "var(--success-color)"; icon = "fa-check-circle"; } if (item.status === "BATAL") { statusColor = "var(--danger-color)"; icon = "fa-times-circle"; } if (item.status === "GANTI") { statusColor = "var(--warning-color)"; icon = "fa-sync-alt"; } if (item.status === "MINTA ULANG") { statusColor = "var(--info-color)"; icon = "fa-envelope"; }
        
        const opTag = getProviderName(item.phone); 
        const srvName = item.serviceName ? String(item.serviceName).toUpperCase() : "SHOPEE";
        const dt = new Date(item.date); const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
        
        card.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><strong style="color: var(--text-primary); font-size: 13px; letter-spacing: 1px;">${formatPhoneNumber(item.phone)} <span style="font-size:9px; font-weight:normal; color:var(--text-secondary);">(${srvName} • ${opTag})</span></strong><span style="color: ${statusColor}; font-weight: 800;"><i class="fas ${icon}"></i> ${item.status}</span></div><div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 10px; margin-bottom: ${item.status === 'SUKSES' || item.status === 'MINTA ULANG' ? '6px' : '0'};"><span>ID: #${item.id}</span><span>${timeStr}</span></div>${item.status === 'SUKSES' || item.status === 'MINTA ULANG' ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px; text-shadow: 0 0 10px rgba(150,212,0,0.3);">${item.otp}</div>` : ''}`;
        list.appendChild(card);
    });
}
window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); history.pushState(null, null, "#history"); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Hapus semua riwayat pesanan?")) { orderHistory = []; localStorage.removeItem(`hero_history_${activeAccountName}`); renderHistory(); } }

async function fetchAccounts() { try { const res = await fetch(`${BASE_URL}/api/accounts`); const data = await res.json(); if (data.accounts && data.accounts.length > 0) { loginAccount(data.accounts[0]); } else { if(currentAccountName) currentAccountName.innerText = "Tidak ada akun"; showToast("Tidak ada akun", "error"); } } catch (error) { if(currentAccountName) currentAccountName.innerText = "Error Koneksi"; showToast("Gagal terhubung", "error"); } }
function loginAccount(accountName) { activeAccountName = accountName; if(currentAccountName) currentAccountName.innerText = accountName; setAccountViewingStatus(true); const rawOrders = JSON.parse(localStorage.getItem(`hero_orders_${accountName}`)) || []; activeOrders = rawOrders.filter(o => o.expiresAt > Date.now()); if (rawOrders.length !== activeOrders.length) saveToStorage(); hiddenBadOrders = JSON.parse(localStorage.getItem(`hero_hidden_bad_orders_${accountName}`)) || []; loadHistory(); initMainApp(); }

async function initMainApp() { fetchBalance(); await loadServices(); renderOrders(); startPollingAndTimer(); }
window.onload = () => { relocateBalanceUI(); setAccountViewingStatus(false); history.pushState(null, null, window.location.href); initUsedNumbersSync(); fetchAccounts(); renderMainButtons(); };
