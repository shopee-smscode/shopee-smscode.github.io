const BASE_URL = "https://virtual-sms-proxy.masreno6pro.workers.dev"; 
const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); 

let appSettings = JSON.parse(localStorage.getItem('app_settings')) || { password: "Aku123..", autoCopy: true };
let activeAccountName = "VirtualUser"; 
let currentServiceId = null; 
let currentCountryId = null; 
let activeOrders = []; let availableProducts = []; let selectedProductId = 'any'; let timerInterval = null; let pollingInterval = null; let orderHistory = [];
let usedNumbersDB = new Set(); let hiddenBadOrders = []; let isUsedNumbersLoaded = false; 
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

const productList = document.getElementById('productList'); 
const btnOrder = document.getElementById('btnOrder'); 
const activeOrdersContainer = document.getElementById('activeOrdersContainer'); 

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
    try {
        const options = { method, headers: {} }; 
        if (body) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
        const response = await fetch(`${BASE_URL}${endpoint}`, options); 
        const textData = await response.text();
        try { 
            return JSON.parse(textData); 
        } catch (err) {
            let lowerText = textData.toLowerCase();
            // DETEKSI CLOUDFLARE ATAU HALAMAN HTML
            if (lowerText.includes("<html") || lowerText.includes("cloudflare") || lowerText.includes("blocked")) {
                return { status: false, message: "Akses API diblokir keamanan server (Cloudflare)." };
            }
            let isErr = lowerText.includes("wrong") || lowerText.includes("error") || lowerText.includes("fail");
            return (response.ok && !isErr) ? { status: true, message: textData || "Success" } : { status: false, message: textData || `Error ${response.status}` };
        }
    } catch (err) { return { status: false, message: "Koneksi Proxy Gagal: " + err.message }; }
}

async function fetchBalance() { 
    const bDisplay = document.getElementById('balanceDisplay'); if (!bDisplay) return;
    try { 
        const res = await apiCall('/v1/profile/'); 
        if (res && (res.status === true || res.status === "true") && res.data && typeof res.data.balance !== 'undefined') {
            bDisplay.innerText = usdFormatter.format(res.data.balance); bDisplay.style.color = "var(--primary-color)"; bDisplay.style.fontSize = "16px";
        } 
    } catch (error) {} 
}

async function loadServices() {
    const serviceSelect = document.getElementById('serviceSelect'); if (!serviceSelect) return;
    try {
        const res = await apiCall('/v1/services/');
        if (res && (res.status === true || res.status === "true") && Array.isArray(res.data)) {
            let services = res.data; services.sort((a, b) => (a.serviceName || "").localeCompare(b.serviceName || ""));
            serviceSelect.innerHTML = ''; let shopeeId = null;
            services.forEach(svc => {
                const opt = document.createElement('option'); opt.value = svc.id; opt.textContent = svc.serviceName; serviceSelect.appendChild(opt);
                if (svc.serviceName && svc.serviceName.toLowerCase().includes('shopee')) shopeeId = svc.id;
            });
            let savedId = localStorage.getItem('virtual_selected_service'); let exists = services.find(s => String(s.id) === String(savedId));
            currentServiceId = exists ? savedId : (shopeeId ? shopeeId : services[0].id);
            serviceSelect.value = currentServiceId; localStorage.setItem('virtual_selected_service', currentServiceId); loadVirtualSMSProducts(currentServiceId);
        } else { serviceSelect.innerHTML = `<option value="">${res.message || 'Error'}</option>`; }
    } catch (e) { serviceSelect.innerHTML = '<option value="">Gagal Jaringan</option>'; }
}

window.changeService = function() { currentServiceId = document.getElementById('serviceSelect').value; localStorage.setItem('virtual_selected_service', currentServiceId); loadVirtualSMSProducts(currentServiceId); }

async function loadVirtualSMSProducts(serviceId) {
    try {
        productList.innerHTML = '<div class="status-text-mini">Mencari Operator...</div>';
        if (btnOrder) btnOrder.disabled = true;
        const res = await apiCall(`/v1/price/${serviceId}`);
        if (res && (res.status === true || res.status === "true") && Array.isArray(res.data)) {
            let countryData = res.data.find(c => (c.countryName && c.countryName.toLowerCase().includes("indonesia")) || String(c.country) === "62" || String(c.country) === "1");
            if (!countryData && res.data.length > 0) countryData = res.data[0];
            if (!countryData) { productList.innerHTML = `<div class="status-text-mini" style="color:var(--danger-color);">Layanan tak tersedia.</div>`; document.getElementById('randomPriceBadge').innerText = "---"; return; }
            
            currentCountryId = countryData.country || countryData.countryId || 1;
            let ops = countryData.operators || []; let priceUsd = countryData.priceUsd || 0;
            document.getElementById('randomPriceBadge').innerText = usdFormatter.format(priceUsd);
            
            availableProducts = [{ id: 'any', code: 'any', name: 'Acak', price: priceUsd }];
            ops.forEach(op => { let code = op.code || op.id; availableProducts.push({ id: code, code: code, name: op.name || op.operatorName || code, price: priceUsd }); });
            
            productList.innerHTML = ''; 
            let savedOp = localStorage.getItem('virtual_selected_operator') || 'any'; 
            let isOpExist = availableProducts.find(p => String(p.code) === String(savedOp));
            selectedProductId = isOpExist ? savedOp : 'any';
            localStorage.setItem('virtual_selected_operator', selectedProductId);
            
            const chkRandom = document.getElementById('chkRandomOp'); if (chkRandom) { chkRandom.checked = (selectedProductId === 'any'); }
            if (btnOrder) btnOrder.disabled = false;
            if (ops.length === 0) { productList.innerHTML = `<div class="status-text-mini">Operator (Acak) tersedia.</div>`; return; }
            
            ops.forEach(op => {
                let opCode = op.code || op.id; let opName = (op.name || op.operatorName || opCode).toUpperCase();
                const card = document.createElement("div"); card.className = "product-card"; card.id = `op-card-${opCode}`;
                if (selectedProductId === String(opCode)) card.classList.add('selected');
                let logoImg = getOperatorLogo(opName + ' ' + opCode); 
                card.innerHTML = `<div class="op-logo-container"><img src="${logoImg}" onerror="this.onerror=null; this.src='https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';" class="op-logo" alt="${opName}"></div><div class="product-info"><h4>${opName}</h4></div><div class="product-price">${usdFormatter.format(priceUsd)}</div>`;
                card.onclick = () => { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); document.getElementById('chkRandomOp').checked = false; selectedProductId = String(opCode); localStorage.setItem('virtual_selected_operator', selectedProductId); };
                productList.appendChild(card);
            });
        } else { productList.innerHTML = `<div class="status-text-mini" style="color:var(--danger-color);">${res.message || 'Kosong'}</div>`; if (btnOrder) btnOrder.disabled = true; }
    } catch (error) { productList.innerHTML = `<div class="status-text-mini" style="color:var(--danger-color);">Error koneksi.</div>`; if (btnOrder) btnOrder.disabled = true; }
}

window.toggleRandomOperator = function() {
    const chk = document.getElementById('chkRandomOp');
    if (chk.checked) { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); selectedProductId = 'any'; localStorage.setItem('virtual_selected_operator', 'any'); } 
    else { if(selectedProductId === 'any' && availableProducts.length > 1) { const f = availableProducts.find(p => p.code !== 'any'); if(f) { selectedProductId = String(f.code); document.getElementById(`op-card-${f.code}`).classList.add('selected'); localStorage.setItem('virtual_selected_operator', selectedProductId); } } }
    if (btnOrder) btnOrder.disabled = false;
}

async function processOrderFreshNumber(operatorCode, maxRetries = 5) {
    if (maxRetries <= 0) { showToast("Banyak nomor bekas.", "error"); return null; }
    const res = await apiCall('/v1/order/', 'POST', { country: Number(currentCountryId), service: Number(currentServiceId), operator: operatorCode === 'any' ? 'any' : operatorCode, type: 1 });
    if (res && (res.status === true || res.status === "true")) {
        let eId = null, ePhone = null, ePrice = 0;
        if (res.data) { let d = Array.isArray(res.data) ? res.data[0] : res.data; if (d.data) d = Array.isArray(d.data) ? d.data[0] : d.data; else if (d.order) d = d.order; eId = d.orderId || d.id || d.Id; ePhone = d.number || d.phone || d.phoneNumber || d.phone_number; ePrice = d.price || d.amount || 0; }
        if (!eId || !ePhone) { const sd = JSON.stringify(res); let m1 = sd.match(/"(?:orderId|id|order_id|Id)"\s*:\s*"?([A-Za-z0-9_-]+)"?/i); if (m1) eId = m1[1]; let m2 = sd.match(/"(?:number|phone|phone_number|phoneNumber)"\s*:\s*"?(\+?\d+)"?/i); if (m2) ePhone = m2[1]; }
        if (!eId || !ePhone) { const ar = await apiCall('/v1/order/active'); if (ar && (ar.status === true || ar.status === "true") && Array.isArray(ar.data) && ar.data.length > 0) { let lo = ar.data[0]; eId = lo.orderId || lo.id; ePhone = lo.number || lo.phone; ePrice = lo.price || ePrice; } }
        
        if (eId && ePhone) {
            let o = { id: String(eId).trim(), phone_number: String(ePhone).trim(), price: ePrice };
            const ps = normalizePhone(o.phone_number);
            if (usedNumbersDB.has(ps)) { hiddenBadOrders.push({ id: o.id, cancelAt: Date.now() + (3*60*1000), isCanceling: false }); localStorage.setItem(`virtual_hidden_bad_orders_${activeAccountName}`, JSON.stringify(hiddenBadOrders)); return await processOrderFreshNumber(operatorCode, maxRetries - 1); } 
            else { return o; }
        } else { showToast("ID/Nomor tak valid", "error"); return null; }
    } else { showToast(res.message || "Gagal mendapat nomor", "error"); return null; }
}

if (btnOrder) {
    btnOrder.onclick = async () => {
        if (!isUsedNumbersLoaded) { showToast("Sabar, sinkron database...", "warning"); return; }
        btnOrder.disabled = true; const oTxt = btnOrder.innerText; btnOrder.innerText = "Memproses...";
        try {
            const o = await processOrderFreshNumber(selectedProductId, 5); 
            if (o) {
                const opInfo = availableProducts.find(p => String(p.code) === String(selectedProductId)); const opPrice = o.price || (opInfo ? opInfo.price : 0);
                activeOrders.unshift({ id: o.id, productId: selectedProductId, phone: o.phone_number, price: opPrice, otp: null, status: "ACTIVE", expiresAt: Date.now() + (20 * 60 * 1000), cancelUnlockTime: Date.now() + 120000, isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(o.phone_number); window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (e) { showToast("Gagal.", "error"); }
        btnOrder.disabled = false; btnOrder.innerText = oTxt;
    };
}

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        for (let j = hiddenBadOrders.length - 1; j >= 0; j--) {
            let bo = hiddenBadOrders[j];
            if (now >= bo.cancelAt && !bo.isCanceling) { bo.isCanceling = true; apiCall(`/v1/order/${bo.id}/1`, 'PATCH').then(() => { hiddenBadOrders.splice(j, 1); localStorage.setItem(`virtual_hidden_bad_orders_${activeAccountName}`, JSON.stringify(hiddenBadOrders)); }).catch(e => { bo.isCanceling = false; }); }
        }
        activeOrders.forEach((o, i) => {
            const left = o.expiresAt - now; const el = document.getElementById(`timer-${o.id}`);
            if (left <= 0) { activeOrders.splice(i, 1); saveToStorage(); fetchBalance(); return; }
            if (el) { const m = Math.floor(left/60000); const s = Math.floor((left%60000)/1000); el.innerText = `${m}:${s<10?'0':''}${s}`; if (left <= 12 * 60000) { el.style.color = "var(--danger-color)"; } else if (left <= 18 * 60000) { el.style.color = "var(--warning-color)"; } else { el.style.color = "#ffffff"; } }
            if (left <= 600000 && o.status !== "OTP_RECEIVED" && !o.isAutoCanceling) { o.isAutoCanceling = true; cancelSpecificOrder(o.id, true); }
            const wait = o.cancelUnlockTime - now; const bC = document.getElementById(`btn-cancel-${o.id}`); const bR = document.getElementById(`btn-replace-${o.id}`); const bE = document.getElementById(`btn-resend-${o.id}`); 
            if (o.status !== "OTP_RECEIVED" && !o.isAutoCanceling) { if (wait <= 0) { if (bC && bC.disabled) bC.disabled = false; if (bR && bR.disabled && !bR.innerHTML.includes('loader')) bR.disabled = false; if (bE && !bE.disabled) bE.disabled = true; } else { if (bC && !bC.disabled) bC.disabled = true; if (bR && !bR.disabled) bR.disabled = true; if (bE && !bE.disabled) bE.disabled = true; } }
        });
    }, 1000);
    
    // DELAY POLLING KE 10 DETIK MENCEGAH BLOKIR CLOUDFLARE
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) return;
        for(let i=0; i<activeOrders.length; i++) {
            let o = activeOrders[i]; if (o.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/v1/order/status/${o.id}`);
                if (res && (res.status === true || res.status === "true") && res.data) {
                    if (res.data.orderStatus === "SUCCESS" && res.data.Sms && res.data.Sms.length > 0) { 
                        notifSound.play().catch(e => console.log(e)); activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.Sms[0].sms; saveToStorage(); fetchBalance();
                        const pStr = normalizePhone(activeOrders[i].phone); if (!usedNumbersDB.has(pStr)) { db.ref('used_numbers/hero_sms').push({ phone: pStr, timestamp: Date.now() }); usedNumbersDB.add(pStr); }
                    } else if (res.data.orderStatus === "CANCEL" || res.data.orderStatus === "REFUND") { activeOrders = activeOrders.filter(ord => String(ord.id) !== String(o.id)); saveToStorage(); fetchBalance(); }
                }
            } catch(e) {}
        }
    }, 10000);
}

function removeOrderWithAnimation(idStr, callback) { const c = document.getElementById(`order-card-${idStr}`); if (c) { c.classList.add('removing'); setTimeout(() => { callback(); }, 300); } else { callback(); } }

window.cancelSpecificOrder = async function(id, auto = false) {
    const idStr = String(id).trim(); const btn = document.getElementById(`btn-cancel-${idStr}`); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try { 
        const res = await apiCall(`/v1/order/${idStr}/1`, 'PATCH'); 
        if (res && (res.status === true || res.status === "true" || (typeof res.message === 'string' && res.message.toLowerCase().includes("success")))) {
            const oo = activeOrders.find(o => String(o.id) === idStr); if (oo) saveToHistory(oo, "BATAL"); recordStat('failed');
            removeOrderWithAnimation(idStr, () => { activeOrders = activeOrders.filter(o => String(o.id) !== idStr); saveToStorage(); fetchBalance(); if(auto) showToast("Otomatis dibatalkan", "error"); else showToast("Dibatalkan", "success"); });
        } else { showToast(res.message || "Gagal batal", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-times"></i> Batal'; } }
    } catch (e) { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-times"></i> Batal'; } }
};

window.finishSpecificOrder = async function(id) {
    const idStr = String(id).trim(); const btn = document.getElementById(`btn-finish-${idStr}`); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try { 
        const res = await apiCall(`/v1/order/${idStr}/3`, 'PATCH'); const oo = activeOrders.find(o => String(o.id) === idStr); if (oo) saveToHistory(oo, "SUKSES"); 
        if (appSettings.autoCopy) copyToClipboard(appSettings.password); recordStat('success');
        removeOrderWithAnimation(idStr, () => { activeOrders = activeOrders.filter(o => String(o.id) !== idStr); saveToStorage(); fetchBalance(); });
    } catch (e) { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Selesai'; } }
};

window.resendSpecificOrder = async function(orderId) {
    const idStr = String(orderId).trim(); const btn = document.getElementById(`btn-resend-${idStr}`); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const res = await apiCall(`/v1/order/${idStr}/2`, 'PATCH');
        if (res && (res.status === true || res.status === "true" || (typeof res.message === 'string' && res.message.toLowerCase().includes("success")))) { 
            showToast("Meminta ulang..."); let idx = activeOrders.findIndex(o => String(o.id) === idStr); if (idx !== -1) { saveToHistory(activeOrders[idx], "MINTA ULANG"); activeOrders[idx].status = "ACTIVE"; activeOrders[idx].otp = null; saveToStorage(); }
        } else { showToast(res.message || "Gagal", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
    } catch (e) { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

window.replaceSpecificOrder = async function(orderId) {
    if (!isUsedNumbersLoaded) { showToast("Sabar, sinkron database...", "warning"); return; }
    const idStr = String(orderId).trim(); const oo = activeOrders.find(o => String(o.id) === idStr); const opToUse = oo ? oo.productId : selectedProductId;
    const btn = document.getElementById(`btn-replace-${idStr}`); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const cRes = await apiCall(`/v1/order/${idStr}/1`, 'PATCH'); 
        if (cRes && (cRes.status === true || cRes.status === "true" || (typeof cRes.message === 'string' && cRes.message.toLowerCase().includes("success")))) {
            if (oo) saveToHistory(oo, "GANTI"); recordStat('failed');
            removeOrderWithAnimation(idStr, async () => {
                activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
                const od = await processOrderFreshNumber(opToUse, 5); 
                if (od) {
                    const opInfo = availableProducts.find(p => String(p.code) === String(opToUse)); const opPrice = od.price || (opInfo ? opInfo.price : (oo ? oo.price : 0));
                    activeOrders.unshift({ id: od.id, productId: opToUse, phone: od.phone_number, price: opPrice, otp: null, status: "ACTIVE", expiresAt: Date.now() + (20 * 60 * 1000), cancelUnlockTime: Date.now() + 120000, isAutoCanceling: false });
                    saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(od.phone_number); showToast("Diganti!"); window.scrollTo({ top: 0, behavior: 'smooth' });
                } else { saveToStorage(); fetchBalance(); }
            });
        } else { showToast(cRes.message || "Gagal", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
    } catch (e) { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

function getOperatorLogo(id) { const i = String(id).toLowerCase(); if (i.includes('telkomsel') || i.includes('tsel')) return 'https://assets.telkomsel.com/public/app-logo/2021-06/telkomsel-logo.png'; if (i.includes('indosat') || i.includes('isat') || i.includes('im3')) return 'https://im3-img.indosatooredoo.com/indosatassets/images/myim3_app_footer.svg'; if (i.includes('xl')) return 'https://d17e22l2uh4h4n.cloudfront.net/corpweb/pub-xlaxiata/2019-03/xl-logo.png'; if (i.includes('axis')) return 'https://www.axis.co.id/img/common/logo.svg'; if (i.includes('three') || i.includes('tri') || i.includes('3')) return 'https://www.three.co.uk/content/dam/threedigital/static-files/components/header/three-logo.svg'; if (i.includes('smartfren') || i.includes('smart')) return 'https://down-id.img.susercontent.com/file/id-11134207-8224s-mkkmirlvdurn5d@resize_w900_nl.webp'; if (i.includes('byu') || i.includes('by.u')) return 'https://www.byu.id/images/logo-byu.png'; return 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png'; }
function renderOrders() {
    const aCount = document.getElementById('activeCount'); if (aCount) aCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text-mini">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = ""; const now = Date.now();
    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`;
        const isSuccess = (order.status === "OTP_RECEIVED" && order.otp); let opTag = order.productId; if (opTag === 'any' || !opTag) { opTag = getProviderName(order.phone); } else { opTag = String(opTag).toUpperCase(); }
        const matchedProduct = availableProducts.find(p => String(p.code) === String(order.productId)); const displayPrice = usdFormatter.format(order.price || (matchedProduct ? matchedProduct.price : 0));
        const wait = order.cancelUnlockTime - now; let otpHtml = isSuccess ? `<div class="otp-title">KODE OTP</div><div class="otp-code">${formatOTP(order.otp)}</div>` : `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU...</div>`;
        let cb = "disabled", rb = "disabled", eb = "disabled", fb = "disabled";
        if (isSuccess) { fb = ""; eb = ""; } else if (wait <= 0 && !order.isAutoCanceling) { cb = ""; rb = ""; }
        let logo = getOperatorLogo(opTag); let fall = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
        const left = order.expiresAt - now; let tColor = "#ffffff"; if (left <= 12 * 60000) { tColor = "var(--danger-color)"; } else if (left <= 18 * 60000) { tColor = "var(--warning-color)"; }
        card.innerHTML = `<div class="order-header"><div class="order-info-left" style="display: flex; align-items: center; gap: 10px;"><div style="width: 28px; height: 28px; background: #fff; border-radius: 6px; padding: 3px; display: flex; justify-content: center; align-items: center;"><img src="${logo}" onerror="this.onerror=null; this.src='${fall}';" style="max-width: 100%; max-height: 100%; object-fit: contain;"></div><div><div class="order-id-label" style="display:inline-block; margin-bottom:2px;">#${order.id}</div><div class="order-price" style="display:block;">${displayPrice}</div></div></div><span class="timer" id="timer-${order.id}" style="color: ${tColor}; font-weight: 900;">--:--</span></div><div class="phone-row"><span class="phone-number">${formatPhoneNumber(order.phone)}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button></div><div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div><div class="action-buttons-grid"><button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}')" ${rb}><i class="fas fa-sync-alt"></i> Ganti</button><button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${eb}><i class="fas fa-envelope"></i> Ulang</button><button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cb}><i class="fas fa-times"></i> Batal</button><button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${fb}><i class="fas fa-check"></i> Selesai</button></div>`;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}
function relocateBalanceUI() { const hc = document.querySelector('.app-header-container'); const bc = document.querySelector('.balance-container'); if(hc && bc && !document.getElementById('newBalanceDisplay')) { bc.style.display = 'none'; const nd = document.createElement('div'); nd.style.textAlign = 'right'; nd.innerHTML = `<span style="font-size: 10px; color: var(--text-secondary); font-weight: bold; text-transform: uppercase; display: block;">Saldo</span><span id="newBalanceDisplay" style="font-size: 16px; font-weight: 900; color: var(--primary-color);">...</span>`; hc.appendChild(nd); const ob = document.getElementById('balanceDisplay'); if(ob) ob.removeAttribute('id'); nd.querySelector('span:last-child').id = 'balanceDisplay'; } }

window.openSettingsModal = function() { document.getElementById('settingsPassword').value = appSettings.password; document.getElementById('settingsAutoCopy').checked = appSettings.autoCopy; document.getElementById('settingsModal').classList.remove('hidden'); history.pushState(null, null, "#settings"); }
window.closeSettingsModal = function() { document.getElementById('settingsModal').classList.add('hidden'); }
window.saveSettings = function() { appSettings.password = document.getElementById('settingsPassword').value; appSettings.autoCopy = document.getElementById('settingsAutoCopy').checked; localStorage.setItem('app_settings', JSON.stringify(appSettings)); closeSettingsModal(); showToast("Pengaturan disimpan!"); renderMainButtons(); }
function renderMainButtons() { const ebw = document.getElementById('extraBtnWrapper'); if (!ebw) return; if (appSettings.autoCopy) { ebw.innerHTML = `<button onclick="copyToClipboard('${appSettings.password}')" class="btn-primary" style="background-color: var(--info-color); margin-top: 6px; width: 100%; border-radius: 12px;"><i class="fas fa-copy"></i> Salin Sandi</button>`; } else { ebw.innerHTML = `<button class="btn-primary" disabled style="background-color: var(--bg-card); color: var(--text-secondary); margin-top: 6px; width: 100%; border-radius: 12px;"><i class="fas fa-check"></i> Selesai (Nonaktif)</button>`; } }
function normalizePhone(p) { if (!p) return ""; p = String(p).replace(/\D/g, ""); if (p.startsWith("0")) p = "62" + p.substring(1); return p; }
function formatPhoneNumber(p) { if (!p) return ""; p = String(p); if (p.startsWith("62")) p = "0" + p.substring(2); return p.replace(/(.{4})/g, '$1 ').trim(); }
function formatOTP(otp) { if (!otp) return ""; const s = String(otp); return s.length >= 6 ? s.slice(0, 3) + " - " + s.slice(3) : s; }
function getProviderName(p) { p = String(p); if (p.startsWith("62")) p = "0" + p.substring(2); const px = p.substring(0, 4); if (['0811','0812','0813','0821','0822','0852','0853','0851'].includes(px)) return "Telkomsel"; if (['0814','0815','0816','0855','0856','0857','0858'].includes(px)) return "Indosat"; if (['0817','0818','0819','0859','0877','0878','0838','0831','0832','0833'].includes(px)) return "XL"; if (['0895','0896','0897','0898','0899'].includes(px)) return "Three"; if (['0881','0882','0883','0884','0885','0886','0887','0888','0889'].includes(px)) return "Smartfren"; return "Acak"; }
function saveToStorage() { localStorage.setItem(`virtual_orders_${activeAccountName}`, JSON.stringify(activeOrders)); renderOrders(); }
function showToast(psn, typ="success") { const t = document.getElementById("toast"); if(!t) return; t.innerHTML = psn; t.style.backgroundColor = typ==="error" ? "var(--danger-color)" : typ==="warning" ? "var(--warning-color)" : "var(--success-color)"; t.style.color = typ==="warning" ? "#000" : "#fff"; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); }
function copyToClipboard(t) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).then(() => showToast("Disalin!")).catch(() => copyFallback(t)); } else copyFallback(t); }
function copyFallback(t) { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute('readonly',''); ta.style.position="absolute"; ta.style.left="-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast("Disalin!"); }
function initUsedNumbersSync() { db.ref('used_numbers/hero_sms').on('value', s => { usedNumbersDB.clear(); let total = 0; if (s.exists()) { s.forEach(c => { if (c.val().phone) { usedNumbersDB.add(normalizePhone(c.val().phone)); total++; } }); } isUsedNumbersLoaded = true; const bdg1 = document.getElementById('blacklistBadge'); const bdg2 = document.getElementById('blacklistDetailCount'); if(bdg1) bdg1.innerText = total; if(bdg2) bdg2.innerText = total; }); }
function recordStat(type) { const t = new Date().toLocaleDateString('en-CA'); db.ref(`stats/hero_sms/${t}/${type}`).transaction(c => (c || 0) + 1); }
window.openStatsModal = function() { document.getElementById('statsModal').classList.remove('hidden'); const d = document.getElementById('statDate'); if(!d.value) d.value = new Date().toLocaleDateString('en-CA'); loadStatsData(); history.pushState(null, null, "#stats"); }
window.closeStatsModal = function() { document.getElementById('statsModal').classList.add('hidden'); }
function loadStatsData() { const d = document.getElementById('statDate').value; const ss = document.getElementById('statSuccess'); const sf = document.getElementById('statFailed'); if(ss) ss.innerText="..."; if(sf) sf.innerText="..."; db.ref(`stats/hero_sms/${d}`).once('value', s => { const val = s.val(); if(ss) ss.innerText = val?.success||0; if(sf) sf.innerText = val?.failed||0; }); }
document.getElementById('statDate').addEventListener('change', loadStatsData);
window.openBlacklistModal = function() { document.getElementById('blacklistModal').classList.remove('hidden'); history.pushState(null, null, "#blacklist"); }
window.closeBlacklistModal = function() { document.getElementById('blacklistModal').classList.add('hidden'); }
function loadHistory() { orderHistory = JSON.parse(localStorage.getItem(`virtual_history_${activeAccountName}`)) || []; renderHistory(); }
function saveToHistory(o, st) { if (!o) return; orderHistory.unshift({ id: o.id, phone: o.phone, op: o.productId, price: o.price, otp: o.otp || "-", status: st, date: Date.now() }); if (orderHistory.length > 50) orderHistory.pop(); localStorage.setItem(`virtual_history_${activeAccountName}`, JSON.stringify(orderHistory)); renderHistory(); }
function renderHistory() { const ls = document.getElementById('history-list'); if (!ls) return; if (orderHistory.length === 0) { ls.innerHTML = '<div class="status-text-mini" style="text-align:center;">Belum ada riwayat.</div>'; return; } ls.innerHTML = ""; orderHistory.forEach(i => { const c = document.createElement('div'); c.style.background = "var(--bg-card)"; c.style.padding = "10px"; c.style.borderRadius = "10px"; c.style.fontSize = "11px"; let sc = "var(--text-secondary)", ic = "fa-clock"; if (i.status === "SUKSES") { sc = "var(--success-color)"; ic = "fa-check-circle"; } if (i.status === "BATAL") { sc = "var(--danger-color)"; ic = "fa-times-circle"; } if (i.status === "GANTI") { sc = "var(--warning-color)"; ic = "fa-sync-alt"; } if (i.status === "MINTA ULANG") { sc = "var(--info-color)"; ic = "fa-envelope"; } const dt = new Date(i.date); const tStr = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; c.innerHTML = `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><strong style="color: var(--text-primary); font-size: 13px;">${formatPhoneNumber(i.phone)} <span style="font-size:9px; color:var(--text-secondary);">(${getProviderName(i.phone)})</span></strong><span style="color: ${sc}; font-weight: 800;"><i class="fas ${ic}"></i> ${i.status}</span></div><div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 10px; margin-bottom: ${i.status === 'SUKSES' || i.status === 'MINTA ULANG' ? '6px' : '0'};"><span>ID: #${i.id}</span><span>${tStr}</span></div>${i.status === 'SUKSES' || i.status === 'MINTA ULANG' ? `<div style="background: var(--otp-bg); border: 1px dashed ${sc}; color: ${sc}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px;">${i.otp}</div>` : ''}`; ls.appendChild(c); }); }
window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); history.pushState(null, null, "#history"); }
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); }
window.clearHistory = function() { if(confirm("Hapus semua riwayat?")) { orderHistory = []; localStorage.removeItem(`virtual_history_${activeAccountName}`); renderHistory(); } }

let isExitModalOpen = false;
window.addEventListener('popstate', (e) => {
    let mods = ['blacklistModal', 'historyModal', 'statsModal', 'settingsModal', 'iframeNoteModal']; let closedAny = false;
    mods.forEach(m => { let el = document.getElementById(m); if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); closedAny = true; } });
    if (closedAny) { history.pushState(null, null, window.location.href); return; }
    if (isExitModalOpen) { document.getElementById('exitModal').classList.add('hidden'); isExitModalOpen = false; history.pushState(null, null, window.location.href); }
    else { document.getElementById('exitModal').classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
});
window.closeExitModal = function() { document.getElementById('exitModal').classList.add('hidden'); isExitModalOpen = false; }
window.confirmExit = function() { window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }

window.onload = async () => { 
    relocateBalanceUI(); history.pushState(null, null, window.location.href); 
    if(document.getElementById('currentAccountName')) document.getElementById('currentAccountName').innerText = "Terhubung";
    initUsedNumbersSync(); 
    const rO = JSON.parse(localStorage.getItem(`virtual_orders_${activeAccountName}`)) || []; activeOrders = rO.filter(o => o.expiresAt > Date.now()); 
    hiddenBadOrders = JSON.parse(localStorage.getItem(`virtual_hidden_bad_orders_${activeAccountName}`)) || []; 
    loadHistory(); renderMainButtons(); fetchBalance(); await loadServices(); renderOrders(); startPollingAndTimer(); 
};
