/* ==========================================================================
   KONFIGURASI UTAMA TEMPLATE (UBAH BAGIAN INI UNTUK APLIKASI SMS BARU)
   ========================================================================== */
const APP_CONFIG = {
    appKey: "smscode",
    appName: "SMS Code",
    baseUrl: "https://sms-code-proxy.masreno6pro.workers.dev",
    topupUrl: "https://smscode.gg/dashboard",
    defaultCountryName: "Indonesia",
    defaultCountryEmoji: "🇮🇩",
    defaultCountryDial: "62",
    defaultServiceName: "Shopee",
    defaultTheme: "day",
    defaultSoundUrl: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"
};

const BASE_URL = APP_CONFIG.baseUrl; 
const DEFAULT_SOUND_URL = APP_CONFIG.defaultSoundUrl;
const STORAGE_PREFIX = APP_CONFIG.appKey;

let notifSound = new Audio(DEFAULT_SOUND_URL);
let activeAudioObjectUrl = null;

const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); 

// === PENGATURAN TEMA SIANG (PUTIH-BIRU) & MALAM (HITAM-KUNING) ===
function initTheme() {
    const savedTheme = localStorage.getItem('otp_template_theme') || APP_CONFIG.defaultTheme;
    applyAppTheme(savedTheme, false);
}

window.applyAppTheme = function(themeName, showNotif = true) {
    const isNight = themeName === 'night';
    document.body.classList.remove('theme-day', 'theme-night', 'theme-smscode');
    document.body.classList.add(isNight ? 'theme-night' : 'theme-day');
    localStorage.setItem('otp_template_theme', isNight ? 'night' : 'day');

    const iconEl = document.getElementById('themeToggleIcon');
    if (iconEl) {
        iconEl.className = isNight ? 'fas fa-sun' : 'fas fa-moon';
    }

    const metaTheme = document.getElementById('metaThemeColor');
    if (metaTheme) {
        metaTheme.setAttribute('content', isNight ? '#0d0f0a' : '#2563eb');
    }

    const btnDay = document.getElementById('btnChoiceDay');
    const btnNight = document.getElementById('btnChoiceNight');
    if (btnDay) btnDay.classList.toggle('active', !isNight);
    if (btnNight) btnNight.classList.toggle('active', isNight);

    if (showNotif) {
        showToast(isNight ? "🌙 Mode Malam (Hitam-Kuning) Aktif" : "☀️ Mode Siang (Putih-Biru) Aktif");
    }
};

window.toggleDayNightTheme = function() {
    const current = localStorage.getItem('otp_template_theme') || APP_CONFIG.defaultTheme;
    applyAppTheme(current === 'night' ? 'day' : 'night', true);
};

window.openTopupPage = function() {
    window.open(APP_CONFIG.topupUrl, '_blank');
};

// === IDENTITAS UNIK PERANGKAT (MENCEGAH PESANAN TERCAMPUR ANTAR HP) ===
let DEVICE_ID = localStorage.getItem(`${STORAGE_PREFIX}_device_id`);
if (!DEVICE_ID) {
    DEVICE_ID = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem(`${STORAGE_PREFIX}_device_id`, DEVICE_ID);
}

let cachedAccounts = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}_cached_accounts`)) || [];
let favoriteServices = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}_favorites`)) || ['shopee', 'whatsapp', 'telegram', 'tiktok'];
let favoriteCountries = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}_fav_countries`)) || ['indonesia'];
let opPriceMap = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}_op_price_map`)) || {};
let svcPriceMap = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}_svc_price_map`)) || {};
let lastSelectedPriceVal = localStorage.getItem(`${STORAGE_PREFIX}_selected_price_val`) ? Number(localStorage.getItem(`${STORAGE_PREFIX}_selected_price_val`)) : null;

let viewingPresenceRef = null;
let activeAccountName = null;
let currentBalanceValue = 0;
let activeOrders = [];
let availableProducts = [];
let cachedOperatorsList = [];
let allCountries = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}_countries_cache`)) || [];
let allServices = [];
let servicesMemoryCache = {};
let catalogMemoryCache = {}; 

// === STATE NEGARA & LAYANAN ===
let currentCountryId = localStorage.getItem(`${STORAGE_PREFIX}_country_id`) ? parseInt(localStorage.getItem(`${STORAGE_PREFIX}_country_id`)) : null;
let currentCountryName = localStorage.getItem(`${STORAGE_PREFIX}_country_name`) || APP_CONFIG.defaultCountryName;
let currentCountryEmoji = localStorage.getItem(`${STORAGE_PREFIX}_country_emoji`) || APP_CONFIG.defaultCountryEmoji;
let currentCountryDial = localStorage.getItem(`${STORAGE_PREFIX}_country_dial`) || APP_CONFIG.defaultCountryDial;

let currentServiceId = localStorage.getItem(`${STORAGE_PREFIX}_service_id`) ? parseInt(localStorage.getItem(`${STORAGE_PREFIX}_service_id`)) : null;
let currentServiceName = localStorage.getItem(`${STORAGE_PREFIX}_service_name`) || APP_CONFIG.defaultServiceName;

let isCatalogFetching = false;
let selectedProductId = null;
let timerWorker = null;
let pollingInterval = null;
let isPolling = false;
let isDroplistOpen = false;
let isSimulatingOtp = false;
let orderHistory = [];
let usedNumbersDB = new Set();

const currentAccountName = document.getElementById('currentAccountName');
const btnOrder = document.getElementById('btnOrder');
const activeOrdersContainer = document.getElementById('activeOrdersContainer');
const exitModal = document.getElementById('exitModal'); 

const idrFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

function getDeviceOrdersKey(accName) {
    return `orders_${STORAGE_PREFIX}_${DEVICE_ID}_${accName}`;
}
function getDeviceHistoryKey(accName) {
    return `history_${STORAGE_PREFIX}_${DEVICE_ID}_${accName}`;
}

function updateBalanceDisplayUI(amount) {
    currentBalanceValue = Number(amount) || 0;
    const bDisplay = document.getElementById('balanceDisplay');
    if (bDisplay) bDisplay.innerText = idrFormatter.format(currentBalanceValue);
}

function updateCountrySelectorUI() {
    const btnCountryText = document.getElementById('btnCountrySelectText');
    const flagEmoji = currentCountryEmoji || "🌐";
    if (btnCountryText) {
        btnCountryText.innerText = `${flagEmoji} ${String(currentCountryName || APP_CONFIG.defaultCountryName).toUpperCase()}`;
    }
    const headerFlag = document.getElementById('headerCountryFlag');
    if (headerFlag) headerFlag.innerText = flagEmoji;
    const navTitle = document.getElementById('navAppTitle');
    if (navTitle) navTitle.innerText = APP_CONFIG.appName;
    const headerTitle = document.getElementById('headerAppTitle');
    if (headerTitle) headerTitle.innerText = APP_CONFIG.appName;
}

// === SISTEM NADA NOTIFIKASI KUSTOM (LINK URL & INTERNAL STORAGE VIA INDEXEDDB) ===
function openAudioDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(`${STORAGE_PREFIX}_audio_db`, 1);
        req.onupgradeneeded = (e) => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains('sounds')) {
                idb.createObjectStore('sounds');
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function saveAudioBlobToDB(blob, fileName) {
    const idb = await openAudioDB();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction('sounds', 'readwrite');
        tx.objectStore('sounds').put(blob, 'custom_otp_sound');
        tx.oncomplete = () => {
            localStorage.setItem(`${STORAGE_PREFIX}_sound_config`, JSON.stringify({ type: 'file', name: fileName }));
            resolve();
        };
        tx.onerror = (e) => reject(e.target.error);
    });
}

async function loadCustomNotificationSound() {
    const cfg = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}_sound_config`)) || { type: 'default', name: 'Nada Bawaan (Default)', url: DEFAULT_SOUND_URL };
    const labelEl = document.getElementById('currentSoundLabel');
    const urlInput = document.getElementById('soundUrlInput');

    if (cfg.type === 'url' && cfg.url) {
        notifSound = new Audio(cfg.url);
        if (labelEl) labelEl.innerText = `Link: ${cfg.url}`;
        if (urlInput) urlInput.value = cfg.url;
    } else if (cfg.type === 'file') {
        try {
            const idb = await openAudioDB();
            const tx = idb.transaction('sounds', 'readonly');
            const req = tx.objectStore('sounds').get('custom_otp_sound');
            req.onsuccess = () => {
                if (req.result) {
                    if (activeAudioObjectUrl) URL.revokeObjectURL(activeAudioObjectUrl);
                    activeAudioObjectUrl = URL.createObjectURL(req.result);
                    notifSound = new Audio(activeAudioObjectUrl);
                    if (labelEl) labelEl.innerText = `File HP: ${cfg.name || 'Audio Kustom'}`;
                    if (urlInput) urlInput.value = '';
                } else {
                    notifSound = new Audio(DEFAULT_SOUND_URL);
                    if (labelEl) labelEl.innerText = 'Nada Bawaan (Default)';
                }
            };
        } catch (e) {
            notifSound = new Audio(DEFAULT_SOUND_URL);
        }
    } else {
        notifSound = new Audio(DEFAULT_SOUND_URL);
        if (labelEl) labelEl.innerText = 'Nada Bawaan (Default)';
        if (urlInput) urlInput.value = '';
    }
}

function playNotifSound() {
    if (!notifSound) notifSound = new Audio(DEFAULT_SOUND_URL);
    notifSound.currentTime = 0;
    notifSound.play().catch(() => {});
}

window.testNotifSound = function() {
    playNotifSound();
    showToast("🔊 Memutar nada notifikasi...");
};

window.handleSoundFileSelect = async function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
        showToast("Pilih file berformat audio (MP3/WAV/OGG)!", "error");
        return;
    }
    try {
        await saveAudioBlobToDB(file, file.name);
        await loadCustomNotificationSound();
        setTimeout(() => playNotifSound(), 150);
        showToast(`Nada "${file.name}" disimpan!`);
    } catch (e) {
        showToast("Gagal menyimpan file audio.", "error");
    }
    event.target.value = '';
};

window.saveSoundUrl = async function() {
    const inputEl = document.getElementById('soundUrlInput');
    const url = (inputEl ? inputEl.value : '').trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        showToast("Masukkan link URL audio yang valid (https://...)", "error");
        return;
    }
    localStorage.setItem(`${STORAGE_PREFIX}_sound_config`, JSON.stringify({ type: 'url', name: url, url: url }));
    await loadCustomNotificationSound();
    playNotifSound();
    showToast("Link nada notifikasi disimpan!");
};

window.resetDefaultSound = async function() {
    localStorage.removeItem(`${STORAGE_PREFIX}_sound_config`);
    await loadCustomNotificationSound();
    playNotifSound();
    showToast("Kembali ke nada notifikasi bawaan!");
};

// === DROPDOWN & MENU LOGIC ===
window.toggleAppDropdown = function() {
    document.getElementById("appDropdown").classList.toggle("show");
    document.getElementById("menuDropdown").classList.remove("show");
};
window.toggleMenuDropdown = function() {
    document.getElementById("menuDropdown").classList.toggle("show");
    document.getElementById("appDropdown").classList.remove("show");
};
window.onclick = function(event) {
    if (!event.target.matches('.dropbtn') && !event.target.closest('.dropbtn') && 
        !event.target.matches('.dropbtn-icon') && !event.target.closest('.dropbtn-icon')) {
        let dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) dropdowns[i].classList.remove('show');
        }
    }
};
window.openIframeNoteModal = function() {
    document.getElementById('iframeNoteModal').classList.remove('hidden');
    history.pushState(null, null, "#notes");
};
window.closeIframeNoteModal = function() {
    document.getElementById('iframeNoteModal').classList.add('hidden');
};

// === EVENT LISTENER JARINGAN & VISIBILITY ===
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        forceCheckOverdueOrders();
        startPolling(); 
        startTimerTick(); 
    }
});
window.addEventListener('online', () => { showToast("🌐 Koneksi Internet Kembali", "success"); forceCheckOverdueOrders(); startPolling(); });
window.addEventListener('offline', () => { showToast("⚠️ Tidak ada koneksi internet", "warning"); });

// === FUNGSI API ===
async function apiCall(endpoint, method = "GET", body = null, customAccount = null) { 
    const targetAccount = customAccount || activeAccountName || "";
    const options = { 
        method: method, 
        headers: { 
            "Content-Type": "application/json", 
            "X-Account-Name": targetAccount 
        }
    }; 
    if (body) options.body = JSON.stringify(body); 
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, options); 
        const textData = await response.text();
        try { 
            return JSON.parse(textData); 
        } catch (err) {
            let lowerText = textData.toLowerCase();
            if (lowerText.includes("<html") || lowerText.includes("cloudflare") || lowerText.includes("500 internal server error")) {
                return { success: false, error: { message: `Worker Cloudflare Error | Status: ${response.status}` } };
            }
            return { success: false, error: { message: `Respons Bukan JSON (Status ${response.status})` } };
        }
    } catch (err) { 
        return { success: false, error: { message: "Koneksi Proxy Gagal: " + err.message } }; 
    }
}

// === MODAL PENGATURAN & GANTI AKUN MODERN ===
window.openSettingsModal = function() {
    const activeLabel = document.getElementById('settingsActiveAccountName');
    if (activeLabel) activeLabel.innerText = activeAccountName || "Belum dipilih";
    loadCustomNotificationSound();
    initTheme();
    updateSimToggleButtonUI();
    document.getElementById('settingsModal').classList.remove('hidden');
    history.pushState(null, null, "#settings");
    renderAccountListInSettings();
};

window.closeSettingsModal = function() {
    document.getElementById('settingsModal').classList.add('hidden');
};

function renderAccountListInSettings() {
    const container = document.getElementById('accountListContainer');
    if (!container) return;
    container.innerHTML = "";

    if (!cachedAccounts || cachedAccounts.length === 0) {
        container.innerHTML = '<div class="status-text-mini">Tidak ada akun ditemukan.</div>';
        return;
    }

    cachedAccounts.forEach(acc => {
        const isActive = (acc === activeAccountName);
        const btn = document.createElement('button');
        btn.className = `account-card-item ${isActive ? 'active' : ''}`;
        btn.id = `btn-acc-${acc}`;
        btn.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div class="account-avatar">
                    <i class="fas ${isActive ? 'fa-user-shield' : 'fa-user'}"></i>
                </div>
                <div>
                    <div style="font-size:13px; font-weight:900; color:${isActive ? 'var(--primary-color)' : 'var(--text-primary)'}; display:flex; align-items:center; gap:6px;">
                        <span>${acc}</span>
                        ${isActive ? '<span style="font-size:9px; background:var(--primary-color); color:var(--primary-contrast); padding:1px 6px; border-radius:6px; font-weight:900;">AKTIF</span>' : ''}
                    </div>
                    <div style="font-size:10px; color:var(--text-secondary); font-weight:600;">Ketuk untuk beralih ke akun ini</div>
                </div>
            </div>
            <span id="bal-${acc}" class="account-balance-pill" style="color:var(--text-secondary);">
                <i class="fas fa-spinner fa-spin"></i>
            </span>
        `;
        btn.onclick = () => {
            switchAccount(acc);
            closeSettingsModal();
            showToast(`Beralih ke akun ${acc}`);
        };
        container.appendChild(btn);
        fetchBalanceForAccount(acc);
    });
}

window.refreshAllAccountBalances = function() {
    const icon = document.getElementById('refreshAccBalIcon');
    if (icon) icon.classList.add('fa-spin');
    cachedAccounts.forEach(acc => fetchBalanceForAccount(acc));
    fetchBalance();
    setTimeout(() => { if (icon) icon.classList.remove('fa-spin'); }, 600);
};

function normalizePhone(phone) { if (!phone) return ""; let p = String(phone).replace(/\D/g, ""); if (p.startsWith("0")) { p = "62" + p.substring(1); } return p; }
function formatPhoneNumber(phone) { 
    if (!phone) return ""; 
    let raw = String(phone).trim();
    let digits = raw.replace(/\D/g, ""); 
    if (digits.startsWith("62")) { 
        digits = "0" + digits.substring(2); 
        return digits.replace(/(.{4})/g, '$1 ').trim(); 
    }
    const prefixPlus = raw.startsWith("+") ? "+" : "";
    return prefixPlus + digits.replace(/(.{4})/g, '$1 ').trim();
}
function formatOTP(otp) { if (!otp) return ""; const otpStr = String(otp).trim(); if (/^\d{6}$/.test(otpStr)) { return otpStr.slice(0, 3) + " - " + otpStr.slice(3); } return otpStr; }

function getProviderName(phone) { 
    let p = String(phone).replace(/\D/g, ""); 
    if (p.startsWith("62")) p = "0" + p.substring(2); 
    const prefix = p.substring(0, 4); 
    if (['0811','0812','0813','0821','0822','0823','0852','0853','0851'].includes(prefix)) return "Telkomsel"; 
    if (['0814','0815','0816','0855','0856','0857','0858'].includes(prefix)) return "Indosat"; 
    if (['0817','0818','0819','0859','0877','0878'].includes(prefix)) return "XL"; 
    if (['0838','0831','0832','0833'].includes(prefix)) return "Axis"; 
    if (['0895','0896','0897','0898','0899'].includes(prefix)) return "Three"; 
    if (['0881','0882','0883','0884','0885','0886','0887','0888','0889'].includes(prefix)) return "Smartfren"; 
    return "Acak"; 
}

function getOperatorLogo(opName) { 
    const i = String(opName || "").toLowerCase(); 
    if (i.includes('telkomsel') || i.includes('tsel')) return 'https://assets.telkomsel.com/public/app-logo/2021-06/telkomsel-logo.png'; 
    if (i.includes('indosat') || i.includes('im3') || i.includes('isat') || i.includes('ooredoo')) return 'https://im3-img.indosatooredoo.com/indosatassets/images/myim3_app_footer.svg'; 
    if (i.includes('axis')) return 'https://www.axis.co.id/img/common/logo.svg'; 
    if (i.includes('xl')) return 'https://iconlogovector.com/uploads/images/2024/09/lg-66ef50c24df06-XL-Axiata-operator-telekomunik.webp'; 
    if (i.includes('three') || i.includes('tri') || i.includes('hutchison') || i === '3') return 'https://www.three.co.uk/content/dam/threedigital/static-files/components/header/three-logo.svg'; 
    if (i.includes('smartfren')) return 'https://down-id.img.susercontent.com/file/id-11134207-8224s-mkkmirlvdurn5d@resize_w900_nl.webp'; 
    return 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png'; 
}

let isExitModalOpen = false;
window.addEventListener('popstate', (e) => {
    let mods = ['countryModal', 'serviceModal', 'blacklistModal', 'historyModal', 'statsModal', 'settingsModal', 'iframeNoteModal']; 
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
    db.ref(`used_numbers/${STORAGE_PREFIX}`).on('value', snapshot => {
        usedNumbersDB.clear(); let operatorCounts = {}; let totalBlacklist = 0;
        if (snapshot.exists()) { snapshot.forEach(child => { if (child.val().phone) { let normalPhone = normalizePhone(child.val().phone); usedNumbersDB.add(normalPhone); totalBlacklist++; let op = getProviderName(normalPhone); operatorCounts[op] = (operatorCounts[op] || 0) + 1; } }); }
        if(document.getElementById('blacklistBadge')) document.getElementById('blacklistBadge').innerText = totalBlacklist;
        if(document.getElementById('blacklistDetailCount')) document.getElementById('blacklistDetailCount').innerText = totalBlacklist;
        let breakdownText = "";
        for (let op in operatorCounts) { breakdownText += `<span style="display:inline-block; background:var(--bg-card); padding:4px 10px; border-radius:10px; margin:4px; font-size:11px; font-weight:bold; color:var(--text-primary); border: 1px solid var(--border-color);">${op}: ${operatorCounts[op]}</span>`; }
        let breakdownDiv = document.getElementById('operatorBreakdown');
        if(breakdownDiv) breakdownDiv.innerHTML = breakdownText;
    });
}

function recordStat(type) { const today = new Date().toLocaleDateString('en-CA'); const statRef = db.ref(`stats/${STORAGE_PREFIX}/${today}/${type}`); statRef.transaction(currentCount => (currentCount || 0) + 1); }
window.openStatsModal = function() { document.getElementById('statsModal').classList.remove('hidden'); const dateInput = document.getElementById('statDate'); if(!dateInput.value) dateInput.value = new Date().toLocaleDateString('en-CA'); loadStatsData(); history.pushState(null, null, "#stats"); };
window.closeStatsModal = function() { document.getElementById('statsModal').classList.add('hidden'); };
function loadStatsData() { const selectedDate = document.getElementById('statDate').value; const sSuccess = document.getElementById('statSuccess'); const sFailed = document.getElementById('statFailed'); if(sSuccess) sSuccess.innerText = "..."; if(sFailed) sFailed.innerText = "..."; db.ref(`stats/${STORAGE_PREFIX}/${selectedDate}`).once('value', snap => { const data = snap.val(); if(sSuccess) sSuccess.innerText = data?.success || 0; if(sFailed) sFailed.innerText = data?.failed || 0; }); }
document.getElementById('statDate').addEventListener('change', loadStatsData);

window.openBlacklistModal = function() { document.getElementById('blacklistModal').classList.remove('hidden'); history.pushState(null, null, "#blacklist"); };
window.closeBlacklistModal = function() { document.getElementById('blacklistModal').classList.add('hidden'); };

function loadHistory() { 
    orderHistory = JSON.parse(localStorage.getItem(getDeviceHistoryKey(activeAccountName))) || []; 
    renderHistory(); 
}
function saveToHistory(order, status) {
    if (!order) return;
    const savedOtp = order.otp || order.lastOtp || "-";
    const historyItem = { id: order.id, phone: order.phone, serviceName: order.serviceName || currentServiceName, operatorName: order.operatorName || getProviderName(order.phone), price: order.price, otp: savedOtp, status: status, date: Date.now() };
    orderHistory.unshift(historyItem); if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem(getDeviceHistoryKey(activeAccountName), JSON.stringify(orderHistory)); 
    renderHistory();
}
function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    if (orderHistory.length === 0) { list.innerHTML = '<div class="status-text-mini" style="text-align:center;">Belum ada riwayat di perangkat ini.</div>'; return; }
    list.innerHTML = "";
    orderHistory.forEach(item => {
        const card = document.createElement('div'); card.style = "background: var(--bg-card); padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 11px;";
        let statusColor = "var(--text-secondary)"; let icon = "fa-clock";
        if (item.status === "SELESAI" || item.status === "SUKSES") { statusColor = "var(--success-color)"; icon = "fa-check-circle"; }
        if (item.status.includes("BATAL")) { statusColor = "var(--danger-color)"; icon = "fa-times-circle"; }
        if (item.status === "GANTI") { statusColor = "var(--warning-color)"; icon = "fa-sync-alt"; }
        if (item.status === "MINTA ULANG") { statusColor = "var(--info-color)"; icon = "fa-envelope"; }
        const srvTag = item.serviceName || "Shopee";
        const opTag = item.operatorName || getProviderName(item.phone); 
        const dt = new Date(item.date); 
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
        const showOtpBox = (item.status === "SELESAI" || item.status === "SUKSES" || item.status === "MINTA ULANG") && item.otp && item.otp !== "-";
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: var(--text-primary); font-size: 13px; letter-spacing: 1px;">${formatPhoneNumber(item.phone)} <span style="font-size:9px; font-weight:normal; color:var(--text-secondary);">(${srvTag} • ${String(opTag).toUpperCase()})</span></strong>
                <span style="color: ${statusColor}; font-weight: 800;"><i class="fas ${icon}"></i> ${item.status}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 10px; margin-bottom: ${showOtpBox ? '6px' : '0'};">
                <span>ID: #${item.id}</span><span>${timeStr}</span>
            </div>
            ${showOtpBox ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px;">${item.otp}</div>` : ''}
        `;
        list.appendChild(card);
    });
}
window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); history.pushState(null, null, "#history"); };
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); };
window.clearHistory = function() { if(confirm("Hapus semua riwayat pesanan di HP ini?")) { orderHistory = []; localStorage.removeItem(getDeviceHistoryKey(activeAccountName)); renderHistory(); } };

// === FAST BOOT ACCOUNT MANAGEMENT ===
async function fetchAccounts() {
    let savedAccount = localStorage.getItem(`${STORAGE_PREFIX}_last_account`);
    if (cachedAccounts.length > 0) {
        let initialAcc = (savedAccount && cachedAccounts.includes(savedAccount)) ? savedAccount : cachedAccounts[0];
        loginAccount(initialAcc);
    }

    try {
        const res = await apiCall('/api/accounts'); 
        if (res && res.success && res.accounts && res.accounts.length > 0) {
            cachedAccounts = res.accounts;
            localStorage.setItem(`${STORAGE_PREFIX}_cached_accounts`, JSON.stringify(cachedAccounts));
            if (!activeAccountName || !cachedAccounts.includes(activeAccountName)) {
                let defaultAcc = (savedAccount && cachedAccounts.includes(savedAccount)) ? savedAccount : cachedAccounts[0]; 
                loginAccount(defaultAcc);
            }
        } else if (!activeAccountName) { 
            throw new Error(res.error ? res.error.message : "Data akun kosong dari server.");
        }
    } catch (error) { 
        if (!activeAccountName) {
            if(document.getElementById('currentAccountBadge')) document.getElementById('currentAccountBadge').innerText = "Mode Darurat"; 
            showToast("Worker Error. Mengaktifkan Mode Darurat...", "error"); 
            cachedAccounts = ["Akun Darurat"];
            loginAccount("Akun Darurat");
        }
    }
}

async function fetchBalanceForAccount(accName) {
    try {
        const res = await apiCall('/balance', 'GET', null, accName);
        const balEl = document.getElementById(`bal-${accName}`);
        if (balEl) {
            if (res.success) { 
                balEl.innerText = idrFormatter.format(res.data.balance); 
                balEl.style.color = (accName === activeAccountName) ? "var(--primary-color)" : "var(--text-primary)"; 
                if (accName === activeAccountName) updateBalanceDisplayUI(res.data.balance);
            } else { 
                balEl.innerText = "Error API"; 
                balEl.style.color = "var(--danger-color)"; 
            }
        }
    } catch (err) { 
        const balEl = document.getElementById(`bal-${accName}`); 
        if (balEl) { balEl.innerText = "Gagal"; balEl.style.color = "var(--danger-color)"; } 
    }
}

window.switchAccount = function(accountName) {
    if (activeAccountName === accountName) return;
    localStorage.setItem(`${STORAGE_PREFIX}_last_account`, accountName);
    if (pollingInterval) clearInterval(pollingInterval);
    setAccountViewingStatus(false);
    const bDisplay = document.getElementById('balanceDisplay'); 
    if (bDisplay) bDisplay.innerText = "..."; 
    loginAccount(accountName);
};

function loginAccount(accountName) { 
    activeAccountName = accountName; 
    if (document.getElementById('currentAccountBadge')) document.getElementById('currentAccountBadge').innerText = accountName;
    if (document.getElementById('settingsActiveAccountName')) document.getElementById('settingsActiveAccountName').innerText = accountName;
    if (currentAccountName) currentAccountName.innerText = accountName; 
    setAccountViewingStatus(true); 
    
    const now = Date.now(); 
    const rawOrders = JSON.parse(localStorage.getItem(getDeviceOrdersKey(accountName))) || []; 
    activeOrders = rawOrders.filter(o => o.expiresAt > now); 
    saveToStorage(); 
    loadHistory(); 
    initMainApp(); 
}

function saveToStorage() { 
    localStorage.setItem(getDeviceOrdersKey(activeAccountName), JSON.stringify(activeOrders)); 
    updateAccountOrdersStatus(); 
    renderOrders(); 
}

function showToast(pesan, type = "success") { 
    const toast = document.getElementById("toast"); 
    if (!toast) return; 
    toast.innerHTML = pesan; 
    if (type === "error") { toast.style.backgroundColor = "var(--danger-color)"; toast.style.color = "#ffffff"; } 
    else if (type === "warning") { toast.style.backgroundColor = "var(--warning-color)"; toast.style.color = "#000000"; }
    else { toast.style.backgroundColor = "var(--primary-color)"; toast.style.color = "var(--primary-contrast)"; } 
    toast.classList.add("show"); 
    setTimeout(() => { toast.classList.remove("show"); }, 2500); 
}

function copyToClipboard(text, customMsg = "Berhasil disalin!") { 
    if (navigator.clipboard && window.isSecureContext) { 
        navigator.clipboard.writeText(text).then(() => { showToast(customMsg); }).catch(() => { copyFallback(text, customMsg); }); 
    } else { 
        copyFallback(text, customMsg); 
    } 
}
function copyFallback(text, customMsg) { 
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); 
    try { document.execCommand('copy'); showToast(customMsg); } catch (err) { showToast("Gagal menyalin.", "error"); } 
    document.body.removeChild(ta); 
}

async function fetchBalance() { 
    try { 
        const res = await apiCall('/balance'); 
        if (res.success && res.data) { 
            updateBalanceDisplayUI(res.data.balance);
        } else { 
            const bDisplay = document.getElementById('balanceDisplay'); 
            if (bDisplay && !currentBalanceValue) bDisplay.innerText = "Error API"; 
        }
    } catch (error) { 
        const bDisplay = document.getElementById('balanceDisplay'); 
        if (bDisplay && !currentBalanceValue) bDisplay.innerText = "Jaringan Error"; 
    } 
}

// === FITUR PILIH NEGARA + FAVORIT DI PALING ATAS ===
function isFavoriteCountry(countryName) {
    const normName = String(countryName || "").toLowerCase().trim();
    return favoriteCountries.includes(normName);
}

window.toggleFavoriteCountry = function(countryName, e) {
    if (e) e.stopPropagation();
    const normName = String(countryName || "").toLowerCase().trim();
    const index = favoriteCountries.indexOf(normName);
    if (index > -1) {
        favoriteCountries.splice(index, 1);
        showToast("Negara dihapus dari Favorit", "warning");
    } else {
        favoriteCountries.push(normName);
        showToast("Negara ditambahkan ke Favorit");
    }
    localStorage.setItem(`${STORAGE_PREFIX}_fav_countries`, JSON.stringify(favoriteCountries));
    filterCountries();
};

window.openCountryModal = function() {
    document.getElementById('countryModal').classList.remove('hidden');
    history.pushState(null, null, "#countries");
    const input = document.getElementById('searchCountryInput');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 80);
    }
    filterCountries();
};

window.closeCountryModal = function() {
    document.getElementById('countryModal').classList.add('hidden');
};

window.filterCountries = function() {
    const query = (document.getElementById('searchCountryInput')?.value || "").toLowerCase().trim();
    const container = document.getElementById('countryListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!allCountries || allCountries.length === 0) {
        container.innerHTML = '<div class="status-text-mini">Memuat daftar negara...</div>';
        return;
    }

    let filtered = allCountries.filter(c => {
        if (c.active === false) return false;
        const nameMatch = String(c.name || "").toLowerCase().includes(query);
        const codeMatch = String(c.code || "").toLowerCase().includes(query);
        const dialMatch = String(c.dial_code || "").toLowerCase().includes(query.replace('+', ''));
        return nameMatch || codeMatch || dialMatch;
    });

    filtered.sort((a, b) => {
        const isFavA = isFavoriteCountry(a.name) ? 1 : 0;
        const isFavB = isFavoriteCountry(b.name) ? 1 : 0;
        if (isFavA !== isFavB) return isFavB - isFavA;
        return String(a.name).localeCompare(String(b.name));
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="status-text-mini">Negara tidak ditemukan.</div>';
        return;
    }

    filtered.forEach(c => {
        const isActive = (String(c.id) === String(currentCountryId));
        const fav = isFavoriteCountry(c.name);
        const btn = document.createElement('div');
        btn.className = `modal-list-item ${isActive ? 'active' : ''}`;

        const safeName = String(c.name).replace(/'/g, "\\'");
        const starColor = fav ? '#f59e0b' : 'var(--text-secondary)';
        const starClass = fav ? 'fas fa-star' : 'far fa-star';
        const flagEmoji = c.emoji || "🌐";
        const dialText = c.dial_code ? `+${c.dial_code}` : "";

        btn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                <i class="${starClass}" style="color: ${starColor}; font-size: 15px; cursor: pointer; padding: 4px; flex-shrink: 0;" onclick="toggleFavoriteCountry('${safeName}', event)"></i>
                <span style="font-size: 16px; flex-shrink: 0;">${flagEmoji}</span>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</span>
                ${dialText ? `<span class="dial-badge">${dialText}</span>` : ''}
            </div>
            ${isActive ? '<i class="fas fa-check-circle" style="color: var(--primary-color); margin-left: 8px; flex-shrink: 0;"></i>' : ''}
        `;

        btn.onclick = () => selectCountry(c);
        container.appendChild(btn);
    });
};

async function selectCountry(countryObj) {
    if (!countryObj) return;
    const isChanged = String(currentCountryId) !== String(countryObj.id);

    currentCountryId = countryObj.id;
    currentCountryName = countryObj.name;
    currentCountryEmoji = countryObj.emoji || "🌐";
    currentCountryDial = countryObj.dial_code || "";

    localStorage.setItem(`${STORAGE_PREFIX}_country_id`, String(currentCountryId));
    localStorage.setItem(`${STORAGE_PREFIX}_country_name`, currentCountryName);
    localStorage.setItem(`${STORAGE_PREFIX}_country_emoji`, currentCountryEmoji);
    localStorage.setItem(`${STORAGE_PREFIX}_country_dial`, currentCountryDial);

    updateCountrySelectorUI();
    closeCountryModal();

    if (isChanged) {
        showToast(`Negara: ${currentCountryEmoji} ${currentCountryName}`);
        await loadServicesForCurrentCountry(true);
        await loadCatalogForCurrentService(false);
    }
}

// === FITUR PILIH LAYANAN + FAVORIT ===
function isFavorite(serviceName) {
    const normName = String(serviceName || "").toLowerCase().trim();
    return favoriteServices.includes(normName);
}

window.toggleFavorite = function(serviceName, e) {
    if (e) e.stopPropagation();
    const normName = String(serviceName || "").toLowerCase().trim();
    const index = favoriteServices.indexOf(normName);
    if (index > -1) {
        favoriteServices.splice(index, 1);
        showToast("Layanan dihapus dari Favorit", "warning");
    } else {
        favoriteServices.push(normName);
        showToast("Layanan ditambahkan ke Favorit");
    }
    localStorage.setItem(`${STORAGE_PREFIX}_favorites`, JSON.stringify(favoriteServices));
    filterServices();
};

window.openServiceModal = function() {
    document.getElementById('serviceModal').classList.remove('hidden');
    history.pushState(null, null, "#services");
    const input = document.getElementById('searchServiceInput');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 80);
    }
    filterServices();
};

window.closeServiceModal = function() {
    document.getElementById('serviceModal').classList.add('hidden');
};

window.filterServices = function() {
    const query = (document.getElementById('searchServiceInput')?.value || "").toLowerCase().trim();
    const container = document.getElementById('serviceListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!allServices || allServices.length === 0) {
        container.innerHTML = '<div class="status-text-mini">Memuat daftar layanan...</div>';
        return;
    }

    let filtered = allServices.filter(s => s.active !== false && (String(s.name).toLowerCase().includes(query) || String(s.code).toLowerCase().includes(query)));
    filtered.sort((a, b) => {
        const isFavA = isFavorite(a.name) ? 1 : 0;
        const isFavB = isFavorite(b.name) ? 1 : 0;
        if (isFavA !== isFavB) return isFavB - isFavA;
        return String(a.name).localeCompare(String(b.name));
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="status-text-mini">Layanan tidak ditemukan di negara ini.</div>';
        return;
    }

    filtered.forEach(svc => {
        const isActive = (String(svc.id) === String(currentServiceId));
        const fav = isFavorite(svc.name);
        const btn = document.createElement('div');
        btn.className = `modal-list-item ${isActive ? 'active' : ''}`;
        
        const safeName = String(svc.name).replace(/'/g, "\\'");
        const starColor = fav ? '#f59e0b' : 'var(--text-secondary)';
        const starClass = fav ? 'fas fa-star' : 'far fa-star';

        btn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                <i class="${starClass}" style="color: ${starColor}; font-size: 15px; cursor: pointer; padding: 4px; flex-shrink: 0;" onclick="toggleFavorite('${safeName}', event)"></i>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${svc.name}</span>
            </div>
            ${isActive ? '<i class="fas fa-check-circle" style="color: var(--primary-color); margin-left: 8px; flex-shrink: 0;"></i>' : ''}
        `;

        btn.onclick = () => {
            currentServiceId = svc.id;
            currentServiceName = svc.name;
            localStorage.setItem(`${STORAGE_PREFIX}_service_id`, String(currentServiceId));
            localStorage.setItem(`${STORAGE_PREFIX}_service_name`, currentServiceName);
            document.getElementById('btnServiceSelectText').innerText = currentServiceName.toUpperCase();
            closeServiceModal();
            loadCatalogForCurrentService(false);
        };
        container.appendChild(btn);
    });
};

// === GRID OPERATOR & PENYIMPANAN HARGA PERSISTEN (NEGARA + LAYANAN + OPERATOR) ===
function getScopeKey() {
    return `${currentCountryId || 'id'}_${currentServiceId || 'def'}`;
}

function getPreferredProductForOperator(opIdStr, opProducts) {
    if (!opProducts || opProducts.length === 0) return null;
    const scopeKey = getScopeKey();
    const svcOpKey = `${scopeKey}_${opIdStr}`;

    const scopedPriceVal = svcPriceMap[scopeKey] !== undefined ? Number(svcPriceMap[scopeKey]) : lastSelectedPriceVal;
    if (scopedPriceVal !== null && !isNaN(scopedPriceVal)) {
        const exactPriceMatch = opProducts.find(p => Number(p.price) === Number(scopedPriceVal));
        if (exactPriceMatch) return exactPriceMatch;
    }

    const savedForOp = opPriceMap[svcOpKey];
    if (savedForOp) {
        const byId = opProducts.find(p => String(p.id) === String(savedForOp.productId));
        if (byId) return byId;
        const byPrice = opProducts.find(p => Number(p.price) === Number(savedForOp.price));
        if (byPrice) return byPrice;
    }

    return opProducts[0];
}

window.handlePriceChange = function() {
    const selectEl = document.getElementById('priceSelect');
    if (!selectEl) return;
    
    selectedProductId = selectEl.value;
    localStorage.setItem(`${STORAGE_PREFIX}_selected_product`, selectedProductId);
    if (btnOrder) btnOrder.disabled = !selectedProductId;

    const selectedOpIdStr = localStorage.getItem(`${STORAGE_PREFIX}_op_${getScopeKey()}`) || localStorage.getItem(`${STORAGE_PREFIX}_selected_op`) || "null";
    
    if (selectedProductId && availableProducts.length > 0) {
        const productInfo = availableProducts.find(p => String(p.id) === String(selectedProductId));
        if (productInfo) {
            const scopeKey = getScopeKey();
            lastSelectedPriceVal = Number(productInfo.price);
            svcPriceMap[scopeKey] = lastSelectedPriceVal;
            localStorage.setItem(`${STORAGE_PREFIX}_selected_price_val`, String(lastSelectedPriceVal));
            localStorage.setItem(`${STORAGE_PREFIX}_svc_price_map`, JSON.stringify(svcPriceMap));
            
            const svcOpKey = `${scopeKey}_${selectedOpIdStr}`;
            opPriceMap[svcOpKey] = { productId: String(productInfo.id), price: Number(productInfo.price) };

            const priceLabelEl = document.getElementById(`price-label-${selectedOpIdStr}`);
            if (priceLabelEl) {
                priceLabelEl.innerText = idrFormatter.format(productInfo.price);
            }

            cachedOperatorsList.forEach(op => {
                const otherOpIdStr = op.operator_id === null ? "null" : String(op.operator_id);
                if (otherOpIdStr === selectedOpIdStr) return;
                const otherOpProducts = availableProducts.filter(p => (p.operator_id === null ? "null" : String(p.operator_id)) === otherOpIdStr);
                const matchingTier = otherOpProducts.find(p => Number(p.price) === lastSelectedPriceVal);
                if (matchingTier) {
                    const otherSvcOpKey = `${scopeKey}_${otherOpIdStr}`;
                    opPriceMap[otherSvcOpKey] = { productId: String(matchingTier.id), price: Number(matchingTier.price) };
                    const otherLabelEl = document.getElementById(`price-label-${otherOpIdStr}`);
                    if (otherLabelEl) otherLabelEl.innerText = idrFormatter.format(matchingTier.price);
                }
            });
            localStorage.setItem(`${STORAGE_PREFIX}_op_price_map`, JSON.stringify(opPriceMap));
        }
    }
};

function renderOperatorGrid(operators, products) {
    const grid = document.getElementById('operatorGrid');
    if (!grid) return;
    
    const fragment = document.createDocumentFragment();
    let renderedCount = 0;

    operators.forEach(op => {
        const opIdStr = op.operator_id === null ? "null" : String(op.operator_id);
        const opProducts = products.filter(p => (p.operator_id === null ? "null" : String(p.operator_id)) === opIdStr);
        
        if (opProducts.length === 0) return;

        renderedCount++;
        opProducts.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

        let opName = (op.operator_id === null || (op.code && op.code.toLowerCase() === 'any')) 
            ? "ACAK" 
            : (op.name || op.local_name || op.code || ("OP " + opIdStr)).toUpperCase();

        const logoImg = getOperatorLogo(opName === "ACAK" ? "random" : (opName + " " + (op.code || "")));
        const fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
        
        const preferredProd = getPreferredProductForOperator(opIdStr, opProducts);
        const displayCardPrice = preferredProd ? preferredProd.price : opProducts[0].price;

        const card = document.createElement("div");
        card.className = "operator-card";
        card.id = `op-card-${opIdStr}`;
        card.dataset.opName = opName;
        card.innerHTML = `
            <div class="op-logo-container"><img src="${logoImg}" onerror="this.src='${fallbackImg}';" class="op-logo" alt="${opName}"></div>
            <div class="op-name">${opName}</div>
            <div class="op-price" id="price-label-${opIdStr}">${idrFormatter.format(displayCardPrice)}</div>
        `;
        
        card.onclick = () => selectOperator(opIdStr, opProducts);
        fragment.appendChild(card);
    });

    if (renderedCount === 0) {
        grid.innerHTML = '<div class="status-text-mini" style="grid-column: 1 / -1;">Stok layanan di negara ini sedang kosong.</div>'; 
        const selectEl = document.getElementById('priceSelect');
        if (selectEl) { selectEl.innerHTML = '<option value="">Kosong</option>'; selectEl.disabled = true; }
        selectedProductId = null;
        if (btnOrder) btnOrder.disabled = true;
        return;
    }
    
    grid.replaceChildren(fragment);
    
    const scopeKey = getScopeKey();
    let savedOp = localStorage.getItem(`${STORAGE_PREFIX}_op_${scopeKey}`) || localStorage.getItem(`${STORAGE_PREFIX}_selected_op`) || "null";
    let initialProducts = products.filter(p => (p.operator_id === null ? "null" : String(p.operator_id)) === savedOp);
    
    if (initialProducts.length === 0) {
        const firstCard = grid.querySelector('.operator-card');
        if (firstCard) {
            savedOp = firstCard.id.replace('op-card-', '');
            initialProducts = products.filter(p => (p.operator_id === null ? "null" : String(p.operator_id)) === savedOp);
        }
    }
    
    selectOperator(savedOp, initialProducts);
}

function selectOperator(opIdStr, opProducts) {
    document.querySelectorAll('.operator-card').forEach(c => c.classList.remove('selected'));
    const selectedCard = document.getElementById(`op-card-${opIdStr}`);
    if (selectedCard) selectedCard.classList.add('selected');
    
    const scopeKey = getScopeKey();
    localStorage.setItem(`${STORAGE_PREFIX}_selected_op`, opIdStr);
    localStorage.setItem(`${STORAGE_PREFIX}_op_${scopeKey}`, opIdStr);
    
    const selectEl = document.getElementById('priceSelect');
    if (!selectEl) return;
    selectEl.innerHTML = "";
    
    if (!opProducts || opProducts.length === 0) {
        selectEl.innerHTML = '<option value="">Kosong</option>';
        selectEl.disabled = true;
        if (btnOrder) btnOrder.disabled = true;
        selectedProductId = null;
        return;
    }
    
    opProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = idrFormatter.format(p.price);
        selectEl.appendChild(opt);
    });
    
    selectEl.disabled = false;
    
    const targetProduct = getPreferredProductForOperator(opIdStr, opProducts);
    selectEl.value = targetProduct ? String(targetProduct.id) : String(opProducts[0].id);
    
    window.handlePriceChange();
}

// === PEMUATAN NEGARA & LAYANAN BERDASARKAN OPENAPI ===
async function ensureCountriesLoaded() {
    if (!allCountries || allCountries.length === 0) {
        const countriesRes = await apiCall('/catalog/countries'); 
        if (!countriesRes.success) throw new Error(countriesRes.error ? countriesRes.error.message : "Gagal memuat negara");
        allCountries = countriesRes.data || [];
        localStorage.setItem(`${STORAGE_PREFIX}_countries_cache`, JSON.stringify(allCountries));
    } else {
        apiCall('/catalog/countries').then(res => {
            if (res && res.success && Array.isArray(res.data)) {
                allCountries = res.data;
                localStorage.setItem(`${STORAGE_PREFIX}_countries_cache`, JSON.stringify(allCountries));
            }
        }).catch(() => {});
    }

    let matchedCountry = null;
    if (currentCountryId) {
        matchedCountry = allCountries.find(c => String(c.id) === String(currentCountryId));
    }
    if (!matchedCountry) {
        matchedCountry = allCountries.find(c => c.code === 'id' || String(c.name).toLowerCase() === 'indonesia') || allCountries[0];
    }

    if (matchedCountry) {
        currentCountryId = matchedCountry.id;
        currentCountryName = matchedCountry.name;
        currentCountryEmoji = matchedCountry.emoji || "🇮🇩";
        currentCountryDial = matchedCountry.dial_code || "62";
        localStorage.setItem(`${STORAGE_PREFIX}_country_id`, String(currentCountryId));
        localStorage.setItem(`${STORAGE_PREFIX}_country_name`, currentCountryName);
        localStorage.setItem(`${STORAGE_PREFIX}_country_emoji`, currentCountryEmoji);
        localStorage.setItem(`${STORAGE_PREFIX}_country_dial`, currentCountryDial);
    }
    updateCountrySelectorUI();
}

async function loadServicesForCurrentCountry(forceFetch = false) {
    if (!currentCountryId) await ensureCountriesLoaded();

    const countryServicesKey = `${STORAGE_PREFIX}_services_${currentCountryId}`;
    const targetCountrySnapshot = currentCountryId;

    if (!forceFetch && servicesMemoryCache[currentCountryId]) {
        allServices = servicesMemoryCache[currentCountryId];
    } else {
        const cachedLocalServices = JSON.parse(localStorage.getItem(countryServicesKey));
        if (!forceFetch && cachedLocalServices && cachedLocalServices.length > 0) {
            allServices = cachedLocalServices;
            servicesMemoryCache[currentCountryId] = allServices;
            apiCall(`/catalog/services?country_id=${currentCountryId}`).then(res => {
                if (res && res.success && Array.isArray(res.data)) {
                    servicesMemoryCache[targetCountrySnapshot] = res.data;
                    localStorage.setItem(countryServicesKey, JSON.stringify(res.data));
                    if (String(currentCountryId) === String(targetCountrySnapshot)) allServices = res.data;
                }
            }).catch(() => {});
        } else {
            const servicesRes = await apiCall(`/catalog/services?country_id=${currentCountryId}`); 
            if (!servicesRes.success) throw new Error(servicesRes.error ? servicesRes.error.message : "Gagal memuat layanan");
            allServices = servicesRes.data || [];
            servicesMemoryCache[currentCountryId] = allServices;
            localStorage.setItem(countryServicesKey, JSON.stringify(allServices));
        }
    }

    if (allServices.length > 0) {
        let matchedSvc = null;
        if (currentServiceId) {
            matchedSvc = allServices.find(s => String(s.id) === String(currentServiceId));
        }
        if (!matchedSvc && currentServiceName) {
            matchedSvc = allServices.find(s => String(s.name).toLowerCase() === String(currentServiceName).toLowerCase());
        }
        if (!matchedSvc) {
            matchedSvc = allServices.find(s => s.code === 'shopee' || String(s.name).toLowerCase().includes('shopee')) || allServices[0];
        }
        if (matchedSvc) {
            currentServiceId = matchedSvc.id;
            currentServiceName = matchedSvc.name;
            localStorage.setItem(`${STORAGE_PREFIX}_service_id`, String(currentServiceId));
            localStorage.setItem(`${STORAGE_PREFIX}_service_name`, currentServiceName);
        }
    }

    const btnSvcText = document.getElementById('btnServiceSelectText');
    if (btnSvcText && currentServiceName) btnSvcText.innerText = currentServiceName.toUpperCase();
}

window.loadCatalogForCurrentService = async function(forceRefresh = false) {
    updateCountrySelectorUI();
    const btnSvcText = document.getElementById('btnServiceSelectText');
    if (btnSvcText && currentServiceName) btnSvcText.innerText = currentServiceName.toUpperCase();

    const scopeKey = getScopeKey();

    if (!forceRefresh && currentCountryId && currentServiceId && catalogMemoryCache[scopeKey]) {
        cachedOperatorsList = catalogMemoryCache[scopeKey].operators;
        availableProducts = catalogMemoryCache[scopeKey].products;
        renderOperatorGrid(cachedOperatorsList, availableProducts);
        return;
    }

    if (isCatalogFetching) return;

    const opGrid = document.getElementById('operatorGrid');
    const refreshIcon = document.getElementById('catalogRefreshIcon');
    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    const localCacheKey = `${STORAGE_PREFIX}_cat_${scopeKey}`;
    const savedLocalCat = JSON.parse(localStorage.getItem(localCacheKey));
    const hasExistingCards = opGrid && opGrid.querySelector('.operator-card') !== null;

    if (!hasExistingCards) {
        if (savedLocalCat && savedLocalCat.operators && savedLocalCat.products && savedLocalCat.products.length > 0) {
            cachedOperatorsList = savedLocalCat.operators;
            availableProducts = savedLocalCat.products;
            renderOperatorGrid(cachedOperatorsList, availableProducts);
        } else if (opGrid) {
            opGrid.innerHTML = '<div class="status-text-mini" style="grid-column: 1 / -1;">Memuat Operator...</div>';
        }
    } else if (!forceRefresh && savedLocalCat && savedLocalCat.operators && savedLocalCat.products) {
        cachedOperatorsList = savedLocalCat.operators;
        availableProducts = savedLocalCat.products;
        renderOperatorGrid(cachedOperatorsList, availableProducts);
    }

    isCatalogFetching = true;
    try {
        await ensureCountriesLoaded();
        await loadServicesForCurrentCountry(false);

        const activeScopeKey = getScopeKey();
        let opsRes = await apiCall(`/catalog/operators?country_id=${currentCountryId}&platform_id=${currentServiceId}`);
        if (!opsRes.success) throw new Error(opsRes.error ? opsRes.error.message : "Gagal memuat operator");

        let operators = Array.isArray(opsRes.data) ? opsRes.data : [];
        if (operators.length === 0) {
            operators = [{ operator_id: null, code: "any", name: "ACAK" }];
        }

        const productRequests = operators.map(op => {
            const opQuery = op.operator_id === null ? "" : `&operator_id=${op.operator_id}`;
            return apiCall(`/catalog/products?country_id=${currentCountryId}&platform_id=${currentServiceId}${opQuery}&sort=price_asc&limit=100`);
        });

        const productResponses = await Promise.all(productRequests);
        let allFetchedProducts = [];

        productResponses.forEach((res, idx) => {
            if (res && res.success && Array.isArray(res.data)) {
                const targetOpId = operators[idx].operator_id;
                res.data.forEach(p => {
                    if (typeof p.operator_id === 'undefined') p.operator_id = targetOpId;
                    allFetchedProducts.push(p);
                });
            }
        });

        cachedOperatorsList = operators;
        availableProducts = allFetchedProducts;
        catalogMemoryCache[activeScopeKey] = { operators: cachedOperatorsList, products: availableProducts };

        localStorage.setItem(`${STORAGE_PREFIX}_cat_${activeScopeKey}`, JSON.stringify({
            operators: cachedOperatorsList,
            products: availableProducts
        }));

        renderOperatorGrid(cachedOperatorsList, availableProducts);
        if (forceRefresh) showToast("Harga & stok diperbarui!");
    } catch (error) { 
        const stillHasCards = opGrid && opGrid.querySelector('.operator-card') !== null;
        if (opGrid && !stillHasCards) {
            opGrid.innerHTML = `<div class="status-text-mini" style="color:var(--danger-color); padding: 8px; border: 1px dashed var(--danger-color); border-radius: 8px; grid-column: 1 / -1;"><b>GAGAL MEMUAT:</b><br>${error.message}</div>`; 
        } else if (forceRefresh) {
            showToast("Gagal memperbarui harga", "error");
        }
    } finally {
        isCatalogFetching = false;
        if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
};

// === PEMESANAN NOMOR BARU ===
if (btnOrder) {
    btnOrder.onclick = async () => {
        if (!selectedProductId) return; 
        btnOrder.disabled = true; 
        const originalText = btnOrder.innerText; 
        btnOrder.innerText = "MEMPROSES...";
        try {
            const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(selectedProductId), quantity: 1 });
            if (res.success && res.data && res.data.orders && res.data.orders.length > 0) {
                const orderData = res.data.orders[0]; 
                const productInfo = availableProducts.find(p => String(p.id) === String(selectedProductId));
                const finalPrice = orderData.amount || orderData.price || (productInfo ? productInfo.price : 0);
                const expiresAtMs = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000); 
                const createdAtMs = orderData.created_at ? new Date(orderData.created_at).getTime() : Date.now();
                const cancelUnlockMs = orderData.cancel_available_at ? new Date(orderData.cancel_available_at).getTime() : createdAtMs + (120 * 1000);
                
                let opNameDisplay = orderData.operator_name || (productInfo && productInfo.operator_name) || getProviderName(orderData.phone_number);
                
                activeOrders.unshift({ 
                    id: orderData.id, 
                    productId: parseInt(selectedProductId), 
                    countryId: currentCountryId,
                    countryName: currentCountryName,
                    serviceName: currentServiceName,
                    operatorName: opNameDisplay,
                    phone: orderData.phone_number, 
                    price: finalPrice, 
                    otp: null, 
                    lastOtp: null,
                    smsRevision: 0,
                    lastSmsRevision: 0,
                    status: "Waiting SMS", 
                    createdAt: createdAtMs,
                    expiresAt: expiresAtMs, 
                    cancelUnlockTime: cancelUnlockMs, 
                    hasReceivedOTP: false,
                    isResent: false,
                    isAutoCanceling: false
                });
                
                if (currentBalanceValue >= finalPrice) {
                    updateBalanceDisplayUI(currentBalanceValue - finalPrice);
                }
                
                saveToStorage(); 
                copyToClipboard(orderData.phone_number, "Pesanan Berhasil & Nomor Disalin!");
                startPolling(); 
                startTimerTick();
                fetchBalance(); 
            } else { 
                showToast(`Gagal: ${res.error ? res.error.message : 'Stok tidak tersedia'}`, "error"); 
            }
        } catch (error) { 
            showToast("Kesalahan jaringan.", "error"); 
        }
        btnOrder.innerText = originalText; 
        btnOrder.disabled = false;
    };
}

// === KOTAK MENUNGGU OTP KOSONG (SAAT BELUM ADA PESANAN) ===
function createEmptyOrderCard() {
    const card = document.createElement("div");
    card.className = "order-card empty-card";
    const fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
    card.innerHTML = `
        <div class="order-header">
            <div class="order-info-left" style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 26px; height: 26px; background: var(--bg-container); border-radius: 6px; padding: 2.5px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; border: 1px solid var(--border-color);">
                    <img src="${fallbackImg}" style="max-width: 100%; max-height: 100%; object-fit: contain; opacity: 0.45;" alt="Empty">
                </div>
                <div style="text-align: left;">
                    <div class="order-id-label" style="display:inline-block;">#- (BELUM ADA PESANAN)</div>
                    <div class="order-price" style="display:block; color: var(--text-secondary);">Rp -</div>
                </div>
            </div>
            <span class="timer" style="color: var(--text-secondary);">--:--</span>
        </div>
        <div class="phone-row">
            <span class="phone-number" style="color: var(--text-secondary); font-size: 16px !important; letter-spacing: 2px;">- - - -</span>
            <button class="btn-copy" disabled aria-label="Salin Nomor"><i class="fas fa-copy"></i></button>
        </div>
        <div class="otp-display empty-otp-box">
            <div style="font-size: 12px; font-weight: 800; color: var(--text-secondary); letter-spacing: 1.4px; text-transform: uppercase;">
                <i class="fas fa-inbox" style="margin-right: 6px; opacity: 0.7;"></i> Belum Ada Pesanan
            </div>
        </div>
        <div class="action-buttons-grid">
            <button class="btn-replace" disabled><i class="fas fa-sync-alt"></i> Ganti</button>
            <button class="btn-resend" disabled><i class="fas fa-envelope"></i> Ulang</button>
            <button class="btn-danger" disabled><i class="fas fa-times"></i> Batal</button>
            <button class="btn-success" disabled><i class="fas fa-check"></i> Selesai</button>
        </div>
    `;
    return card;
}

// === RENDER KARTU ORDER AKTIF ===
function createOrderCard(order) {
    const now = Date.now();
    const card = document.createElement("div"); 
    card.className = "order-card"; 
    card.id = `order-card-${order.id}`; 
    
    const isSuccess = (order.status === "OTP_RECEIVED" || order.status === "Recieved" || order.status === "Done" || Boolean(order.otp)); 
    const wait = (order.cancelUnlockTime || 0) - now;
    
    const srvName = String(order.serviceName || currentServiceName || "SHOPEE").toUpperCase();
    const providerName = String(order.operatorName || getProviderName(order.phone)).toUpperCase();
    const headerLogoUrl = getOperatorLogo(providerName);
    const fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
    const displayPrice = (order.price && order.price != 0) ? idrFormatter.format(order.price) : 'Rp -';
    
    let otpHtml = isSuccess ? `
        <div class="otp-title">KODE OTP</div>
        <div class="otp-code" style="margin:0 !important; padding-right: 42px;">${formatOTP(order.otp)}</div>
        <button class="btn-copy" onclick="copyToClipboard('${order.otp}', 'Kode OTP disalin!')" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-copy"></i></button>
    ` : `
        <div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div></div>
        <div class="waiting-text">MENUNGGU SMS...</div>
    `;
    
    const passProductId = order.productId ? `'${order.productId}'` : 'null'; 
    let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";
    
    if (isSuccess) { 
        finishBtnAttr = ""; 
        resendBtnAttr = ""; 
        cancelBtnAttr = "disabled"; 
        replaceBtnAttr = "disabled"; 
    } else {
        if (order.isResent) {
            cancelBtnAttr = "disabled";
            replaceBtnAttr = "disabled";
            resendBtnAttr = "disabled";
            finishBtnAttr = "";
        } else if (wait <= 0 && !order.isAutoCanceling) { 
            cancelBtnAttr = ""; 
            replaceBtnAttr = ""; 
            resendBtnAttr = "disabled"; 
            finishBtnAttr = "disabled";
        }
    }

    const left = order.expiresAt - now;
    let timerColor = "var(--text-primary)";
    if (left <= 3 * 60000) timerColor = "var(--danger-color)";
    else if (left <= 5 * 60000) timerColor = "var(--warning-color)";

    let m = Math.floor(Math.max(0, left) / 60000);
    let s = Math.floor((Math.max(0, left) % 60000) / 1000);
    let timeStr = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;

    card.innerHTML = `
        <div class="order-header">
            <div class="order-info-left" style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 26px; height: 26px; background: #fff; border-radius: 6px; padding: 2.5px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; border: 1px solid var(--border-color);">
                    <img src="${headerLogoUrl}" onerror="this.src='${fallbackImg}';" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="${providerName}">
                </div>
                <div style="text-align: left;">
                    <div class="order-id-label" style="display:inline-block; max-width: 195px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom;">#${order.id} (${srvName} • ${providerName})</div>
                    <div class="order-price" style="display:block;">${displayPrice}</div>
                </div>
            </div>
            <span class="timer" id="timer-${order.id}" style="color: ${timerColor};">${timeStr}</span>
        </div>
        <div class="phone-row">
            <span class="phone-number">${formatPhoneNumber(order.phone)}</span>
            <button class="btn-copy" onclick="copyToClipboard('${order.phone}', 'Nomor disalin!')"><i class="fas fa-copy"></i></button>
        </div>
        <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div>
        <div class="action-buttons-grid">
            <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}', ${passProductId})" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button>
            <button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button>
            <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button>
            <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button>
        </div>
    `;
    return card;
}

// === RENDER KOTAK UTAMA + MENU PESANAN LAMA ===
function renderOrders() {
    if (!activeOrdersContainer) return;
    const fragment = document.createDocumentFragment();

    if (activeOrders.length === 0) {
        isDroplistOpen = false;
        fragment.appendChild(createEmptyOrderCard());
    } else {
        fragment.appendChild(createOrderCard(activeOrders[0]));
    }

    const oldOrdersCount = Math.max(0, activeOrders.length - 1);
    const hasOldOrders = oldOrdersCount > 0;
    if (!hasOldOrders) isDroplistOpen = false;

    const wrapper = document.createElement("div"); 
    wrapper.className = "old-orders-wrapper";
    
    const btnToggle = document.createElement("button"); 
    btnToggle.className = `btn-droplist ${(isDroplistOpen && hasOldOrders) ? 'open' : ''} ${!hasOldOrders ? 'disabled' : ''}`; 
    btnToggle.disabled = !hasOldOrders;
    btnToggle.innerHTML = `
        <span><i class="fas fa-history"></i> Lihat ${oldOrdersCount} Pesanan Lama</span>
        <i class="fas fa-chevron-${(isDroplistOpen && hasOldOrders) ? 'up' : 'down'}"></i>
    `; 
    
    if (hasOldOrders) {
        btnToggle.onclick = () => { isDroplistOpen = !isDroplistOpen; renderOrders(); };
    }
    wrapper.appendChild(btnToggle);
    
    if (hasOldOrders) {
        const content = document.createElement("div"); 
        content.className = `old-orders-content ${isDroplistOpen ? 'show' : ''}`;
        
        const btnCancelAll = document.createElement("button"); 
        btnCancelAll.className = "btn-cancel-all"; 
        btnCancelAll.id = "btn-cancel-all-old";
        btnCancelAll.innerHTML = `<i class="fas fa-trash-alt"></i> Batalkan Semua Pesanan Lama`; 
        btnCancelAll.onclick = cancelAllOldOrders;
        content.appendChild(btnCancelAll);

        for (let i = 1; i < activeOrders.length; i++) { 
            content.appendChild(createOrderCard(activeOrders[i])); 
        }
        wrapper.appendChild(content); 
    }

    fragment.appendChild(wrapper);
    activeOrdersContainer.replaceChildren(fragment);
    updateSimToggleButtonUI();
}

// === WEB WORKER TIMER & PENGECEKAN WAKTU HABIS ===
function forceCheckOverdueOrders() {
    let needsSave = false;
    const now = Date.now();
    for (let i = activeOrders.length - 1; i >= 0; i--) {
        let o = activeOrders[i];
        const left = o.expiresAt - now;
        if (left <= 0) {
            if (!String(o.id).startsWith('SIM')) {
                if (o.isResent || o.hasReceivedOTP || o.otp) {
                    apiCall('/orders/finish', 'POST', { id: parseInt(o.id) }).catch(() => {});
                    saveToHistory(o, "SELESAI");
                    recordStat('success');
                } else {
                    apiCall('/orders/cancel', 'POST', { id: parseInt(o.id) }).catch(() => {});
                    saveToHistory(o, "BATAL");
                    recordStat('failed');
                }
            }
            activeOrders.splice(i, 1);
            needsSave = true;
        }
    }
    if (needsSave) { saveToStorage(); fetchBalance(); }
}

function startTimerTick() {
    const runTick = () => {
        const now = Date.now();
        let needsSave = false;
        
        for (let i = activeOrders.length - 1; i >= 0; i--) {
            let order = activeOrders[i];
            const timeLeft = order.expiresAt - now;
            const timerElement = document.getElementById(`timer-${order.id}`);
            
            if (timeLeft <= 0) { 
                if (!String(order.id).startsWith('SIM')) {
                    if (order.isResent || order.hasReceivedOTP || order.otp) {
                        apiCall('/orders/finish', 'POST', { id: parseInt(order.id) }).catch(() => {});
                        saveToHistory(order, "SELESAI");
                        recordStat('success');
                    } else {
                        apiCall('/orders/cancel', 'POST', { id: parseInt(order.id) }).catch(() => {});
                        saveToHistory(order, "BATAL");
                        recordStat('failed');
                    }
                }
                activeOrders.splice(i, 1); 
                needsSave = true;
                continue; 
            }
            
            if (timerElement) { 
                const m = Math.floor(timeLeft / 60000); 
                const s = Math.floor((timeLeft % 60000) / 1000); 
                timerElement.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`; 
                if (timeLeft <= 3 * 60000) timerElement.style.color = "var(--danger-color)";
                else if (timeLeft <= 5 * 60000) timerElement.style.color = "var(--warning-color)";
                else timerElement.style.color = "var(--text-primary)";
            }
            
            if (timeLeft <= 600000 && !String(order.id).startsWith('SIM') && !order.hasReceivedOTP && !order.otp && !order.isResent && !order.isAutoCanceling) { 
                order.isAutoCanceling = true; 
                cancelSpecificOrder(order.id, true); 
            }
            
            const wait = (order.cancelUnlockTime || 0) - now; 
            const btnCancel = document.getElementById(`btn-cancel-${order.id}`); 
            const btnReplace = document.getElementById(`btn-replace-${order.id}`); 
            const btnResend = document.getElementById(`btn-resend-${order.id}`); 
            
            if (!order.hasReceivedOTP && !order.otp && !order.isResent && !order.isAutoCanceling) {
                if (wait <= 0) { 
                    if (btnCancel && btnCancel.disabled) btnCancel.disabled = false; 
                    if (btnReplace && btnReplace.disabled && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false; 
                    if (btnResend && !btnResend.disabled) btnResend.disabled = true; 
                } else { 
                    if (btnCancel && !btnCancel.disabled) btnCancel.disabled = true; 
                    if (btnReplace && !btnReplace.disabled) btnReplace.disabled = true; 
                    if (btnResend && !btnResend.disabled) btnResend.disabled = true; 
                }
            }
        }
        if (needsSave) { saveToStorage(); fetchBalance(); }
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

// === POLLING CERDAS DENGAN FILTER SMS_REVISION & NADA NOTIFIKASI KUSTOM ===
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    const runPoll = async () => {
        if (isPolling || activeOrders.length === 0) return;
        const realOrders = activeOrders.filter(o => !String(o.id).startsWith('SIM'));
        if (realOrders.length === 0) return;

        isPolling = true;
        try {
            const res = await apiCall('/orders/active');
            if (res.success && Array.isArray(res.data)) {
                let changed = false;
                activeOrders.forEach(localOrder => {
                    if (String(localOrder.id).startsWith('SIM')) return;
                    if (localOrder.status === "Recieved" || localOrder.status === "Done" || localOrder.otp) return;

                    const srvOrder = res.data.find(s => String(s.id) === String(localOrder.id));
                    if (srvOrder) {
                        let rawText = srvOrder.otp_code || srvOrder.otp_message || "";
                        let extractedOtp = srvOrder.otp_code;
                        if (!extractedOtp && rawText) {
                            let match = String(rawText).match(/\d{4,8}/);
                            extractedOtp = match ? match[0] : rawText;
                        }

                        const srvRev = typeof srvOrder.sms_revision === 'number' ? srvOrder.sms_revision : 0;
                        let isNewValidOtp = false;

                        if (localOrder.isResent) {
                            if (srvRev > (localOrder.lastSmsRevision || 1) && extractedOtp) {
                                isNewValidOtp = true;
                            } else if (srvOrder.status === "OTP_RECEIVED" && extractedOtp && extractedOtp !== localOrder.lastOtp) {
                                isNewValidOtp = true;
                            }
                        } else {
                            if ((srvOrder.status === "OTP_RECEIVED" || extractedOtp) && extractedOtp) {
                                isNewValidOtp = true;
                            }
                        }

                        if (isNewValidOtp) {
                            playNotifSound();
                            localOrder.status = "Recieved";
                            localOrder.otp = extractedOtp;
                            localOrder.lastOtp = extractedOtp;
                            localOrder.hasReceivedOTP = true;
                            localOrder.smsRevision = srvRev > 0 ? srvRev : ((localOrder.lastSmsRevision || 0) + 1);
                            changed = true;
                            
                            const phoneStr = normalizePhone(localOrder.phone);
                            if (!usedNumbersDB.has(phoneStr)) { 
                                db.ref(`used_numbers/${STORAGE_PREFIX}`).push({ phone: phoneStr, timestamp: Date.now() }); 
                                usedNumbersDB.add(phoneStr); 
                            }
                        }
                    }
                });
                if (changed) {
                    saveToStorage();
                    fetchBalance();
                }
            }
        } catch (e) {}
        isPolling = false;
    };

    runPoll();
    pollingInterval = setInterval(runPoll, 4000);
}

// === AKSI ORDER: GANTI, ULANG, BATAL, BATAL SEMUA, SELESAI ===
window.replaceSpecificOrder = async function(orderId, productId) {
    // Jika ini adalah kartu Simulasi, ganti nomor simulasi secara instan
    if (String(orderId).startsWith('SIM')) {
        const idx = activeOrders.findIndex(o => String(o.id) === String(orderId));
        if (idx !== -1) {
            activeOrders[idx].phone = "62813" + Math.floor(10000000 + Math.random() * 90000000);
            activeOrders[idx].otp = null;
            activeOrders[idx].status = "Waiting SMS";
            saveToStorage();
            copyToClipboard(activeOrders[idx].phone, "Nomor simulasi diganti & disalin!");
            setTimeout(() => {
                if (activeOrders[idx] && String(activeOrders[idx].id) === String(orderId)) {
                    const fakeCode = String(Math.floor(100000 + Math.random() * 900000));
                    activeOrders[idx].status = "Recieved";
                    activeOrders[idx].otp = fakeCode;
                    activeOrders[idx].hasReceivedOTP = true;
                    playNotifSound();
                    saveToStorage();
                    showToast("⚡ Simulasi: Kode OTP Baru Masuk!");
                }
            }, 1500);
        }
        return;
    }

    const btn = document.getElementById(`btn-replace-${orderId}`); 
    const targetProductId = selectedProductId || ((productId && productId !== 'null') ? productId : null);
    if (!targetProductId) return showToast("Pilih harga/operator terlebih dahulu.", "error"); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    
    const oldOrder = activeOrders.find(o => String(o.id) === String(orderId)); 
    const pInfo = availableProducts.find(p => String(p.id) === String(targetProductId));
    const estimatedPrice = pInfo ? Number(pInfo.price) : 0;

    try {
        let cancelRes, createRes;

        if (currentBalanceValue >= estimatedPrice && estimatedPrice > 0) {
            [cancelRes, createRes] = await Promise.all([
                apiCall('/orders/cancel', 'POST', { id: parseInt(orderId) }),
                apiCall('/orders/create', 'POST', { product_id: parseInt(targetProductId), quantity: 1 })
            ]);
        } else {
            cancelRes = await apiCall('/orders/cancel', 'POST', { id: parseInt(orderId) });
            if (cancelRes.success || (cancelRes.error && cancelRes.error.code === 'NOT_FOUND')) {
                if (cancelRes.data && typeof cancelRes.data.new_balance === 'number') {
                    updateBalanceDisplayUI(cancelRes.data.new_balance);
                }
                createRes = await apiCall('/orders/create', 'POST', { product_id: parseInt(targetProductId), quantity: 1 });
            }
        }

        const isCancelOk = cancelRes && (cancelRes.success || (cancelRes.error && cancelRes.error.code === 'NOT_FOUND'));

        if (isCancelOk) {
            if (oldOrder) saveToHistory(oldOrder, "GANTI");
            activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId));
        }

        if (createRes && createRes.success && createRes.data && createRes.data.orders && createRes.data.orders.length > 0) {
            const od = createRes.data.orders[0]; 
            const finalPrice = od.amount || od.price || estimatedPrice;
            const cancelUnlockMs = od.cancel_available_at ? new Date(od.cancel_available_at).getTime() : Date.now() + (120 * 1000);
            activeOrders.unshift({ 
                id: od.id, 
                productId: parseInt(targetProductId), 
                countryId: currentCountryId,
                countryName: currentCountryName,
                serviceName: currentServiceName,
                operatorName: od.operator_name || (pInfo && pInfo.operator_name) || getProviderName(od.phone_number),
                phone: od.phone_number, 
                price: finalPrice, 
                otp: null, 
                lastOtp: null,
                smsRevision: 0,
                lastSmsRevision: 0,
                status: "Waiting SMS", 
                createdAt: Date.now(),
                expiresAt: new Date(od.expires_at).getTime(), 
                cancelUnlockTime: cancelUnlockMs, 
                hasReceivedOTP: false,
                isResent: false,
                isAutoCanceling: false
            });
            saveToStorage(); 
            copyToClipboard(od.phone_number, "Berhasil mendapat nomor baru & disalin!");
            startPolling(); 
            startTimerTick(); 
            fetchBalance(); 
        } else if (isCancelOk) {
            saveToStorage();
            fetchBalance();
            showToast(createRes && createRes.error ? createRes.error.message : "Nomor lama dibatalkan, gagal pesan baru.", "error");
        } else {
            showToast(cancelRes && cancelRes.error ? cancelRes.error.message : "Belum mencapai batas waktu batal.", "error"); 
            renderOrders();
        }
    } catch (e) { 
        showToast("Error Jaringan.", "error"); 
        renderOrders();
    }
};

window.resendSpecificOrder = async function(id) {
    // Jika kartu Simulasi, simulasikan minta ulang SMS kedua dalam 1.5 detik
    if (String(id).startsWith('SIM')) {
        let idx = activeOrders.findIndex(o => String(o.id) === String(id));
        if (idx !== -1) {
            saveToHistory({ ...activeOrders[idx] }, "MINTA ULANG");
            activeOrders[idx].status = "Waiting SMS";
            activeOrders[idx].otp = null;
            activeOrders[idx].hasReceivedOTP = false;
            activeOrders[idx].isResent = true;
            saveToStorage();
            showToast("⚡ Simulasi: Meminta ulang kode SMS...");
            setTimeout(() => {
                let target = activeOrders.find(o => String(o.id) === String(id));
                if (target) {
                    const fakeCode2 = String(Math.floor(100000 + Math.random() * 900000));
                    target.status = "Recieved";
                    target.otp = fakeCode2;
                    target.lastOtp = fakeCode2;
                    target.hasReceivedOTP = true;
                    playNotifSound();
                    saveToStorage();
                    showToast("⚡ Simulasi: Kode OTP Kedua Masuk!");
                }
            }, 1500);
        }
        return;
    }

    const btnResend = document.getElementById(`btn-resend-${id}`);
    if (btnResend) { btnResend.disabled = true; btnResend.innerHTML = '<div class="loader"></div>'; }
    
    try {
        const res = await apiCall('/orders/resend', 'POST', { id: parseInt(id) }); 
        if (res.success) {
            showToast("Meminta kode SMS baru...");
            let idx = activeOrders.findIndex(o => String(o.id) === String(id));
            if (idx !== -1) {
                saveToHistory({ ...activeOrders[idx] }, "MINTA ULANG");
                
                activeOrders[idx].lastOtp = activeOrders[idx].otp;
                activeOrders[idx].lastSmsRevision = activeOrders[idx].smsRevision || 1;
                activeOrders[idx].status = "Waiting SMS";
                activeOrders[idx].otp = null;
                activeOrders[idx].hasReceivedOTP = false; 
                activeOrders[idx].isResent = true; 
                
                saveToStorage();
            }
        } else {
            showToast("Gagal resend: " + (res.error ? res.error.message : "Error"), "error");
        }
    } catch (e) { 
        showToast("Error sistem: " + e.message, "error"); 
    } finally { 
        renderOrders(); 
    }
};

window.finishSpecificOrder = async function(orderId) {
    let oIdx = activeOrders.findIndex(x => String(x.id) === String(orderId));
    if (oIdx === -1) return;
    let orderToSave = activeOrders[oIdx];

    // Jika kartu Simulasi, selesaikan langsung tanpa panggil API
    if (String(orderId).startsWith('SIM')) {
        isSimulatingOtp = false;
        saveToHistory(orderToSave, "SELESAI");
        const card = document.getElementById(`order-card-${orderId}`);
        if (card) card.classList.add('removing');
        setTimeout(() => {
            activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId));
            if (activeOrders.length <= 1) isDroplistOpen = false;
            saveToStorage();
            showToast("⚡ Simulasi Pesanan Selesai");
        }, 220);
        return;
    }

    const btn = document.getElementById(`btn-finish-${orderId}`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }

    try {
        const res = await apiCall('/orders/finish', 'POST', { id: parseInt(orderId) });
        
        if (res.success || (res.error && (res.error.code === 'NOT_FOUND' || res.error.code === 'CONFLICT'))) {
            saveToHistory(orderToSave, "SELESAI");
            recordStat('success');
            
            const card = document.getElementById(`order-card-${orderId}`);
            if (card) card.classList.add('removing');
            
            setTimeout(() => {
                activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId));
                if (activeOrders.length <= 1) isDroplistOpen = false;
                saveToStorage();
                fetchBalance();
                showToast("Pesanan Selesai");
                renderOrders();
            }, 250);
        } else {
            showToast(res.error ? res.error.message : "Gagal menyelesaikan pesanan di server", "error");
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Selesai'; }
        }
    } catch (e) {
        showToast("Gagal memproses permintaan", "error");
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Selesai'; }
    }
};

window.cancelSpecificOrder = async function(id, auto = false) {
    // Jika kartu Simulasi, batalkan langsung tanpa panggil API
    if (String(id).startsWith('SIM')) {
        isSimulatingOtp = false;
        const oldOrder = activeOrders.find(o => String(o.id) === String(id));
        if (oldOrder) saveToHistory(oldOrder, "BATAL");
        const card = document.getElementById(`order-card-${id}`);
        if (card) card.classList.add('removing');
        setTimeout(() => {
            activeOrders = activeOrders.filter(o => String(o.id) !== String(id));
            if (activeOrders.length <= 1) isDroplistOpen = false;
            saveToStorage();
            showToast("⚡ Simulasi Pesanan Dibatalkan");
        }, 220);
        return;
    }

    const btnCancel = document.getElementById(`btn-cancel-${id}`); 
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerHTML = '<div class="loader"></div>'; }
    try { 
        const res = await apiCall('/orders/cancel', 'POST', { id: parseInt(id) }); 
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { 
            const oldOrder = activeOrders.find(o => String(o.id) === String(id)); 
            if (oldOrder) saveToHistory(oldOrder, "BATAL"); 
            recordStat('failed');
            
            const card = document.getElementById(`order-card-${id}`);
            if (card) card.classList.add('removing');

            setTimeout(() => {
                activeOrders = activeOrders.filter(o => String(o.id) !== String(id)); 
                if (activeOrders.length <= 1) isDroplistOpen = false;
                saveToStorage(); 
                
                if (res.data && typeof res.data.new_balance === 'number') {
                    updateBalanceDisplayUI(res.data.new_balance);
                } else {
                    fetchBalance();
                }
                
                if (auto) showToast("Otomatis dibatalkan (Waktu Habis)", "error"); 
                else showToast("Pesanan Dibatalkan", "success"); 
                renderOrders();
            }, 250);
        } else { 
            showToast(res.error ? res.error.message : "Gagal dibatalkan.", "error"); 
            if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } 
        } 
    } catch (e) { 
        if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } 
    }
};

window.cancelAllOldOrders = async function() {
    if (activeOrders.length <= 1) return;
    const oldOrders = activeOrders.slice(1);
    const btnAll = document.getElementById("btn-cancel-all-old");
    if (btnAll) { btnAll.disabled = true; btnAll.innerHTML = '<div class="loader" style="width:14px;height:14px;border-width:2px;"></div>'; }
    showToast(`Membatalkan ${oldOrders.length} pesanan lama...`, "warning");

    const cancelPromises = oldOrders.map(async (order) => {
        if (String(order.id).startsWith('SIM')) {
            saveToHistory(order, "BATAL");
            return order.id;
        }
        try {
            const res = await apiCall('/orders/cancel', 'POST', { id: parseInt(order.id) });
            if (res.success || (res.error && res.error.code === 'NOT_FOUND')) {
                saveToHistory(order, "BATAL");
                recordStat('failed');
                if (res.data && typeof res.data.new_balance === 'number') {
                    updateBalanceDisplayUI(res.data.new_balance);
                }
                return order.id;
            }
        } catch (e) {}
        return null;
    });

    const results = await Promise.all(cancelPromises);
    const canceledIds = results.filter(id => id !== null);

    if (canceledIds.length > 0) {
        activeOrders = activeOrders.filter(o => !canceledIds.includes(o.id));
        if (activeOrders.length <= 1) isDroplistOpen = false;
        saveToStorage();
        fetchBalance();
        showToast(`${canceledIds.length} pesanan lama dibatalkan.`, "success");
    } else {
        showToast("Belum ada pesanan lama yang melewati batas waktu batal (2 menit).", "error");
        if (btnAll) { btnAll.disabled = false; btnAll.innerHTML = `<i class="fas fa-trash-alt"></i> Batalkan Semua Pesanan Lama`; }
    }
};

// === FITUR TOGGLE SIMULASI OTP MASUK ===
function updateSimToggleButtonUI() {
    const hasSimOrder = activeOrders.some(o => String(o.id).startsWith('SIM'));
    isSimulatingOtp = hasSimOrder;
    const btnTop = document.getElementById('btnSimulateOtpTop');
    const lblStatus = document.getElementById('lblSimStatus');

    if (btnTop) {
        btnTop.style.backgroundColor = hasSimOrder ? 'var(--success-color)' : 'var(--bg-card)';
        btnTop.style.color = hasSimOrder ? '#ffffff' : 'var(--primary-color)';
        btnTop.style.borderColor = hasSimOrder ? 'var(--success-color)' : 'var(--border-color)';
    }
    if (lblStatus) {
        lblStatus.innerText = hasSimOrder ? 'AKTIF' : 'NONAKTIF';
    }
}

window.toggleSimulateOtpIncoming = function() {
    const existingSim = activeOrders.find(o => String(o.id).startsWith('SIM'));
    if (existingSim) {
        isSimulatingOtp = false;
        activeOrders = activeOrders.filter(o => !String(o.id).startsWith('SIM'));
        if (activeOrders.length <= 1) isDroplistOpen = false;
        saveToStorage();
        showToast("Simulasi OTP dimatikan", "warning");
        return;
    }

    isSimulatingOtp = true;
    const simId = "SIM" + Math.floor(1000 + Math.random() * 9000);
    const nowMs = Date.now();
    const simPrice = lastSelectedPriceVal || 435;

    activeOrders.unshift({
        id: simId,
        productId: selectedProductId || 0,
        countryId: currentCountryId,
        countryName: currentCountryName,
        serviceName: currentServiceName || "Shopee",
        operatorName: "Telkomsel",
        phone: "62812" + Math.floor(10000000 + Math.random() * 90000000),
        price: simPrice,
        otp: null,
        lastOtp: null,
        smsRevision: 0,
        lastSmsRevision: 0,
        status: "Waiting SMS",
        createdAt: nowMs,
        expiresAt: nowMs + (20 * 60 * 1000),
        cancelUnlockTime: nowMs,
        hasReceivedOTP: false,
        isResent: false,
        isAutoCanceling: false
    });

    saveToStorage();
    startTimerTick();
    showToast("⚡ Simulasi dimulai: Menunggu SMS (1.5 detik)...");

    setTimeout(() => {
        const target = activeOrders.find(o => String(o.id) === simId);
        if (target) {
            const fakeCode = String(Math.floor(100000 + Math.random() * 900000));
            target.status = "Recieved";
            target.otp = fakeCode;
            target.lastOtp = fakeCode;
            target.hasReceivedOTP = true;
            playNotifSound();
            saveToStorage();
            showToast("⚡ Simulasi: Kode OTP Masuk!");
        }
    }, 1500);
};

// === INISIALISASI PARALEL ===
function initMainApp() { 
    updateCountrySelectorUI();
    renderOrders(); 
    if (activeOrders.length > 0) { startPolling(); startTimerTick(); }
    
    fetchBalance();
    loadCatalogForCurrentService(false);
}

window.onload = () => { 
    initTheme();
    loadCustomNotificationSound();
    updateCountrySelectorUI();
    setAccountViewingStatus(false); 
    history.pushState(null, null, window.location.href); 
    initUsedNumbersSync(); 
    fetchAccounts(); 
};
