/* ==========================================================================
   KONFIGURASI UTAMA OTP CEPAT (MENGGUNAKAN MASTER TEMPLATE)
   ========================================================================== */
const APP_CONFIG = {
    appKey: "otpcepat",
    appName: "OTP Cepat ⚡",
    baseUrl: "https://otp-cepat-proxy.masreno6pro.workers.dev",
    defaultApiKey: "69c532208d65442fadbeb05df1ebf0c3",
    topupUrl: "https://otpcepat.org/topup",
    defaultCountryName: "Indonesia",
    defaultCountryEmoji: "🇮🇩",
    defaultTheme: "day", // "day" (Putih-Biru) atau "night" (Hitam-Kuning)
    defaultSoundUrl: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"
};

const API_BASE_URL = APP_CONFIG.baseUrl; 
const DEFAULT_API_KEY = APP_CONFIG.defaultApiKey; 
const DEFAULT_SOUND_URL = APP_CONFIG.defaultSoundUrl;
const STORAGE_PREFIX = APP_CONFIG.appKey;

let notifSound = new Audio(DEFAULT_SOUND_URL);
let activeAudioObjectUrl = null;

const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// === IDENTITAS UNIK PERANGKAT (ISOLASI PESANAN ANTAR HP) ===
let DEVICE_ID = localStorage.getItem(`${STORAGE_PREFIX}_device_id`);
if (!DEVICE_ID) {
    DEVICE_ID = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem(`${STORAGE_PREFIX}_device_id`, DEVICE_ID);
}

let apiKey = localStorage.getItem('otp_api_key') || DEFAULT_API_KEY;
let activeOrders = JSON.parse(localStorage.getItem(`otp_active_orders_${DEVICE_ID}`)) || JSON.parse(localStorage.getItem('otp_active_orders')) || [];
let orderHistory = JSON.parse(localStorage.getItem(`otp_history_${DEVICE_ID}`)) || JSON.parse(localStorage.getItem('otp_history')) || [];
let favoriteServices = JSON.parse(localStorage.getItem('otp_favorites')) || ['shopee', 'whatsapp', 'telegram', 'tiktok'];
let favoriteCountries = JSON.parse(localStorage.getItem('otp_fav_countries')) || ['indonesia'];

let allCountries = JSON.parse(localStorage.getItem('otp_countries_cache')) || [];
let promoServices = [];
let prioritasServices = [];
let allServices = [];
let allOperators = [];

let currentCountryId = localStorage.getItem('otp_country_id') || ""; 
let currentCountryName = localStorage.getItem('otp_country_name') || APP_CONFIG.defaultCountryName;
let currentCategory = localStorage.getItem('otp_category') || "promo";
let currentServiceId = localStorage.getItem('otp_service') || "";
let currentServiceName = localStorage.getItem('otp_service_name') || "";
let currentServicePrice = localStorage.getItem('otp_service_price') || 0;
let currentOperator = localStorage.getItem('otp_operator') || "random";

let pollingInterval = null;
let timerWorker = null; 
let isPolling = false; 
let isDroplistOpen = false;
let usedNumbersDB = new Set();

const rpFormatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

// === SISTEM TEMA SIANG (PUTIH-BIRU) & MALAM (HITAM-KUNING) ===
function initTheme() {
    const savedTheme = localStorage.getItem('otp_template_theme') || APP_CONFIG.defaultTheme;
    applyAppTheme(savedTheme, false);
}

window.applyAppTheme = function(themeName, showNotif = true) {
    const isNight = themeName === 'night';
    document.body.classList.remove('theme-day', 'theme-night', 'theme-otp');
    document.body.classList.add(isNight ? 'theme-night' : 'theme-day');
    localStorage.setItem('otp_template_theme', isNight ? 'night' : 'day');

    const iconEl = document.getElementById('themeToggleIcon');
    if (iconEl) iconEl.className = isNight ? 'fas fa-sun' : 'fas fa-moon';

    const metaTheme = document.getElementById('metaThemeColor');
    if (metaTheme) metaTheme.setAttribute('content', isNight ? '#0d0f0a' : '#2563eb');

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

// === SISTEM NADA NOTIFIKASI KUSTOM (FILE HP VIA INDEXEDDB & LINK URL) ===
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

// === DROPDOWN & MODAL NAVIGATION ===
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

let isExitModalOpen = false;
window.addEventListener('popstate', () => {
    let mods = ['countryModal', 'serviceModal', 'blacklistModal', 'historyModal', 'statsModal', 'settingsModal', 'iframeNoteModal']; 
    let closedAny = false;
    mods.forEach(m => { let el = document.getElementById(m); if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); closedAny = true; } });
    if (closedAny) { history.pushState(null, null, window.location.href); return; }
    
    const exitModal = document.getElementById('exitModal');
    if (isExitModalOpen) { closeExitModal(); history.pushState(null, null, window.location.href); }
    else if (exitModal) { exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
});

window.closeExitModal = function() { document.getElementById('exitModal').classList.add('hidden'); isExitModalOpen = false; };
window.confirmExit = function() { window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); };

// === FORMATTER & OPERATOR HELPERS ===
function normalizePhone(phone) { if (!phone) return ""; let p = String(phone).replace(/\D/g, ""); if (p.startsWith("0")) { p = "62" + p.substring(1); } return p; }
function formatPhoneNumber(phone) { 
    if (!phone) return ""; 
    let p = String(phone).replace(/\D/g, "");
    if (p.startsWith("62")) { p = "0" + p.substring(2); } 
    return p.replace(/(.{4})/g, '$1 ').trim(); 
}
function formatOTP(otp) { if (!otp) return ""; const otpStr = String(otp).trim(); if (/^\d{6}$/.test(otpStr)) { return otpStr.slice(0, 3) + " - " + otpStr.slice(3); } return otpStr; }

function guessOperator(phone) {
    let p = String(phone).replace(/\D/g, "");
    if (p.startsWith("62")) p = "0" + p.substring(2);
    let prefix = p.substring(0, 4);
    const telkomsel = ["0811","0812","0813","0821","0822","0823","0851","0852","0853"];
    const indosat = ["0814","0815","0816","0855","0856","0857","0858"];
    const xl = ["0817","0818","0819","0859","0877","0878"];
    const axis = ["0831","0832","0833","0838"];
    const three = ["0895","0896","0897","0898","0899"];
    const smartfren = ["0881","0882","0883","0884","0885","0886","0887","0888","0889"];
    if (telkomsel.includes(prefix)) return "Telkomsel";
    if (indosat.includes(prefix)) return "Indosat";
    if (xl.includes(prefix)) return "XL";
    if (axis.includes(prefix)) return "Axis";
    if (three.includes(prefix)) return "Three";
    if (smartfren.includes(prefix)) return "Smartfren";
    return "ACAK"; 
}

function getCountryEmoji(countryName) {
    const n = String(countryName || "").toLowerCase();
    if (n.includes("indonesia") || n.includes("indo")) return "🇮🇩";
    if (n.includes("malaysia")) return "🇲🇾";
    if (n.includes("singapore") || n.includes("singapura")) return "🇸🇬";
    if (n.includes("philippines") || n.includes("filipina")) return "🇵🇭";
    if (n.includes("vietnam")) return "🇻🇳";
    if (n.includes("thailand")) return "🇹🇭";
    if (n.includes("united states") || n.includes("usa") || n.includes("amerika")) return "🇺🇸";
    if (n.includes("united kingdom") || n.includes("uk") || n.includes("inggris")) return "🇬🇧";
    if (n.includes("india")) return "🇮🇳";
    if (n.includes("russia") || n.includes("rusia")) return "🇷🇺";
    if (n.includes("china") || n.includes("tiongkok")) return "🇨🇳";
    if (n.includes("brazil") || n.includes("brasil")) return "🇧🇷";
    if (n.includes("cambodia") || n.includes("kamboja")) return "🇰🇭";
    if (n.includes("myanmar")) return "🇲🇲";
    if (n.includes("laos")) return "🇱🇦";
    return "🌐";
}

function updateCountrySelectorUI() {
    const emoji = getCountryEmoji(currentCountryName);
    const btnText = document.getElementById('btnCountrySelectText');
    if (btnText) btnText.innerText = `${emoji} ${String(currentCountryName || "INDONESIA").toUpperCase()}`;
    const headerFlag = document.getElementById('headerCountryFlag');
    if (headerFlag) headerFlag.innerText = emoji;
}

// === STATISTIK & BLACKLIST FIREBASE ===
function initUsedNumbersSync() {
    db.ref(`used_numbers/${STORAGE_PREFIX}`).on('value', snapshot => {
        usedNumbersDB.clear(); let operatorCounts = {}; let totalBlacklist = 0;
        if (snapshot.exists()) { snapshot.forEach(child => { if (child.val().phone) { let normalPhone = normalizePhone(child.val().phone); usedNumbersDB.add(normalPhone); totalBlacklist++; let op = guessOperator(normalPhone); operatorCounts[op] = (operatorCounts[op] || 0) + 1; } }); }
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

function showToast(pesan, type = "success") { 
    const t = document.getElementById("toast"); 
    if (!t) return;
    t.innerHTML = pesan; 
    if (type === "error") { t.style.backgroundColor = "var(--danger-color)"; t.style.color = "#ffffff"; } 
    else if (type === "warning") { t.style.backgroundColor = "var(--warning-color)"; t.style.color = "#000000"; } 
    else { t.style.backgroundColor = "var(--primary-color)"; t.style.color = "var(--primary-contrast)"; } 
    t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); 
}

function copyToClipboard(t, customSuccessMsg = "Berhasil disalin!") {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(t).then(() => {
            showToast(customSuccessMsg);
        }).catch(() => {
            fallbackCopy(t, customSuccessMsg);
        });
    } else {
        fallbackCopy(t, customSuccessMsg);
    }
}

function fallbackCopy(t, customSuccessMsg) {
    try {
        const ta = document.createElement("textarea"); ta.value = t; 
        ta.style.position = "fixed"; ta.style.opacity = "0"; 
        document.body.appendChild(ta); ta.focus(); ta.select(); 
        let success = document.execCommand('copy');
        if(success) showToast(customSuccessMsg);
        else showToast("Gagal menyalin.", "error");
        document.body.removeChild(ta); 
    } catch(e) { showToast("Gagal menyalin.", "error"); }
}

// === API CALL OTP CEPAT ===
async function apiCall(action, extraParams = "") {
    if (!apiKey) return { status: "false", msg: "API Key Kosong" };
    const timeStamp = new Date().getTime(); 
    const url = `${API_BASE_URL}?api_key=${apiKey}&action=${action}${extraParams}&_t=${timeStamp}`;
    
    try {
        const response = await fetch(url, { cache: 'no-store' });
        const text = await response.text();
        
        try { 
            return JSON.parse(text); 
        } catch (jsonErr) { 
            if (action === 'get_status') {
                return { status: "false", msg: "silent_error" };
            }
            return { status: "false", msg: "Respons API cacat/Server sibuk." }; 
        }
    } catch (err) { 
        if (action === 'get_status') {
            return { status: "false", msg: "silent_error" };
        }
        return { status: "false", msg: "Koneksi terputus: " + err.message }; 
    }
}

// === PENGATURAN API KEY & SUARA ===
window.openSettingsModal = function() { 
    document.getElementById('settingsApiKey').value = apiKey === DEFAULT_API_KEY ? "" : apiKey; 
    document.getElementById('settingsApiKey').placeholder = "Default aktif. Isi jika ingin ganti...";
    const emailEl = document.getElementById('currentAccountEmail');
    const settingsEmailEl = document.getElementById('settingsActiveAccountEmail');
    if (settingsEmailEl && emailEl) settingsEmailEl.innerText = emailEl.innerText;
    loadCustomNotificationSound();
    initTheme();
    document.getElementById('settingsModal').classList.remove('hidden'); 
    history.pushState(null, null, "#settings");
};

window.closeSettingsModal = function() { 
    document.getElementById('settingsModal').classList.add('hidden'); 
};

window.saveSettings = async function() {
    let inputKey = document.getElementById('settingsApiKey').value.trim();
    apiKey = inputKey ? inputKey : DEFAULT_API_KEY;
    localStorage.setItem('otp_api_key', apiKey); 
    closeSettingsModal(); 
    showToast(inputKey ? "API Key Disimpan!" : "Kembali ke API Default!"); 
    initApp();
};

async function initApp() { 
    fetchBalance(); 
    await loadCountriesAndInitServices(); 
}

window.refreshCatalogAndOperators = async function() {
    const icon = document.getElementById('catalogRefreshIcon');
    if (icon) icon.classList.add('fa-spin');
    await fetchServices();
    if (icon) icon.classList.remove('fa-spin');
    showToast("Layanan & harga diperbarui!");
};

window.fetchBalance = async function() {
    const res = await apiCall('getBalance');
    if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
        const dataPayload = res.data || res;
        const emailTxt = dataPayload.email || "Akun Terhubung";
        document.getElementById('currentAccountEmail').innerText = emailTxt;
        const settingsEmail = document.getElementById('settingsActiveAccountEmail');
        if (settingsEmail) settingsEmail.innerText = emailTxt;
        document.getElementById('balanceDisplay').innerText = rpFormatter.format(dataPayload.saldo || 0);
    } else { 
        document.getElementById('balanceDisplay').innerText = "Gagal"; 
    }
};

// === MODAL PILIH NEGARA + FAVORIT DI PALING ATAS ===
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
    localStorage.setItem('otp_fav_countries', JSON.stringify(favoriteCountries));
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

    let filtered = allCountries.filter(c => String(c.countryName || "").toLowerCase().includes(query));

    filtered.sort((a, b) => {
        const isFavA = isFavoriteCountry(a.countryName) ? 1 : 0;
        const isFavB = isFavoriteCountry(b.countryName) ? 1 : 0;
        if (isFavA !== isFavB) return isFavB - isFavA;
        return String(a.countryName).localeCompare(String(b.countryName));
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="status-text-mini">Negara tidak ditemukan.</div>';
        return;
    }

    filtered.forEach(c => {
        const isActive = (String(c.countryID) === String(currentCountryId));
        const fav = isFavoriteCountry(c.countryName);
        const btn = document.createElement('div');
        btn.className = `modal-list-item ${isActive ? 'active' : ''}`;

        const safeName = String(c.countryName).replace(/'/g, "\\'");
        const starColor = fav ? '#f59e0b' : 'var(--text-secondary)';
        const starClass = fav ? 'fas fa-star' : 'far fa-star';
        const flagEmoji = getCountryEmoji(c.countryName);

        btn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                <i class="${starClass}" style="color: ${starColor}; font-size: 15px; cursor: pointer; padding: 4px; flex-shrink: 0;" onclick="toggleFavoriteCountry('${safeName}', event)"></i>
                <span style="font-size: 16px; flex-shrink: 0;">${flagEmoji}</span>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.countryName}</span>
            </div>
            ${isActive ? '<i class="fas fa-check-circle" style="color: var(--primary-color); margin-left: 8px; flex-shrink: 0;"></i>' : ''}
        `;

        btn.onclick = () => selectCountry(c);
        container.appendChild(btn);
    });
};

async function selectCountry(countryObj) {
    if (!countryObj) return;
    const isChanged = String(currentCountryId) !== String(countryObj.countryID);

    currentCountryId = countryObj.countryID;
    currentCountryName = countryObj.countryName;

    localStorage.setItem('otp_country_id', String(currentCountryId));
    localStorage.setItem('otp_country_name', currentCountryName);

    updateCountrySelectorUI();
    closeCountryModal();

    if (isChanged) {
        showToast(`Negara: ${getCountryEmoji(currentCountryName)} ${currentCountryName}`);
        await fetchServices();
    }
}

async function loadCountriesAndInitServices() {
    updateCountrySelectorUI();
    if (allCountries.length > 0 && currentCountryId) {
        fetchServices();
    }

    const res = await apiCall('getCountries');
    if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
        const dataList = res.data || [];
        allCountries = dataList;
        localStorage.setItem('otp_countries_cache', JSON.stringify(allCountries));

        let matched = null;
        if (currentCountryId) {
            matched = dataList.find(c => String(c.countryID) === String(currentCountryId));
        }
        if (!matched) {
            matched = dataList.find(c => String(c.countryName).toLowerCase().includes("indonesia") || String(c.countryName).toLowerCase().includes("indo")) || dataList[0];
        }
        if (matched) {
            currentCountryId = matched.countryID;
            currentCountryName = matched.countryName;
            localStorage.setItem('otp_country_id', String(currentCountryId));
            localStorage.setItem('otp_country_name', currentCountryName);
            updateCountrySelectorUI();
        }
        await fetchServices();
    }
}

// === MODAL LAYANAN, KATEGORI PROMO/PRIORITAS & HARGA ===
function findServiceMatch(list, name) {
    if (!name || !list || list.length === 0) return null;
    let n = String(name).toLowerCase().trim();
    
    let exact = list.find(s => String(s.serviceName).toLowerCase().trim() === n);
    if (exact) return exact;

    let cleanN = n.replace(/\s*\([^)]*\)/g, '').trim();
    let cleanExact = list.find(s => String(s.serviceName).toLowerCase().replace(/\s*\([^)]*\)/g, '').trim() === cleanN);
    if (cleanExact) return cleanExact;

    let inc = list.find(s => String(s.serviceName).toLowerCase().includes(cleanN) || cleanN.includes(String(s.serviceName).toLowerCase()));
    if (inc) return inc;

    return null;
}

function isFavorite(serviceName) {
    const normName = String(serviceName).toLowerCase().trim();
    return favoriteServices.includes(normName);
}

window.toggleFavorite = function(serviceName, e) {
    if (e) e.stopPropagation();
    const normName = String(serviceName).toLowerCase().trim();
    const index = favoriteServices.indexOf(normName);
    
    if (index > -1) {
        favoriteServices.splice(index, 1);
        showToast("Dihapus dari Favorit", "warning");
    } else {
        favoriteServices.push(normName);
        showToast("Ditambahkan ke Favorit");
    }
    
    localStorage.setItem('otp_favorites', JSON.stringify(favoriteServices));
    filterServices();
};

window.onCategoryChanged = async function() {
    currentCategory = document.getElementById('categorySelect').value;
    localStorage.setItem('otp_category', currentCategory);
    
    let listToSearch = currentCategory === "promo" ? promoServices : prioritasServices;
    let matched = findServiceMatch(listToSearch, currentServiceName);
    
    if (matched) {
        currentServiceId = matched.serviceID;
        currentServicePrice = matched.price;
    }
    
    allServices = [...listToSearch];
    updateServiceButtonUI();
    checkCategoryAvailability();
    updateOperatorCardPrices();
};

async function fetchServices() {
    const [resPromo, resPrio] = await Promise.all([
        apiCall('getSpecialServices'),
        apiCall('getServices', `&country_id=${currentCountryId}`)
    ]);

    if (resPromo.status === "true" || resPromo.status === true || resPromo.status == 1 || String(resPromo.status).toLowerCase() === "success") promoServices = resPromo.data || [];
    if (resPrio.status === "true" || resPrio.status === true || resPrio.status == 1 || String(resPrio.status).toLowerCase() === "success") prioritasServices = resPrio.data || [];

    let listToSearch = currentCategory === "promo" ? promoServices : prioritasServices;
    
    if (listToSearch.length === 0) {
        currentCategory = currentCategory === "promo" ? "prioritas" : "promo";
        listToSearch = currentCategory === "promo" ? promoServices : prioritasServices;
        document.getElementById('categorySelect').value = currentCategory;
        localStorage.setItem('otp_category', currentCategory);
    }

    allServices = [...listToSearch];
    
    let matched = findServiceMatch(listToSearch, currentServiceName) || findServiceMatch(listToSearch, "Shopee") || listToSearch[0];
    if (matched) {
        currentServiceId = matched.serviceID;
        currentServiceName = matched.serviceName;
        currentServicePrice = matched.price;
    }

    updateServiceButtonUI();
    checkCategoryAvailability();
    await fetchOperators();
}

function checkCategoryAvailability() {
    if (!currentServiceName) return;
    let promoMatch = findServiceMatch(promoServices, currentServiceName);
    let prioMatch = findServiceMatch(prioritasServices, currentServiceName);
    
    const sel = document.getElementById('categorySelect');
    if (sel && sel.options.length >= 2) {
        sel.options[0].disabled = !promoMatch; 
        sel.options[0].innerText = promoMatch ? `🔥 PROMO (${rpFormatter.format(promoMatch.price)})` : `🔥 PROMO (Kosong)`;
        
        sel.options[1].disabled = !prioMatch; 
        sel.options[1].innerText = prioMatch ? `⭐ PRIORITAS (${rpFormatter.format(prioMatch.price)})` : `⭐ PRIORITAS (Kosong)`;
    }
}

function updateServiceButtonUI() {
    if (currentServiceName) {
        document.getElementById('btnServiceSelectText').innerText = currentServiceName.toUpperCase();
    }
    localStorage.setItem('otp_service', currentServiceId);
    localStorage.setItem('otp_service_name', currentServiceName);
    localStorage.setItem('otp_service_price', currentServicePrice);
}

function updateOperatorCardPrices() {
    const formatted = rpFormatter.format(currentServicePrice || 0);
    document.querySelectorAll('.op-price').forEach(el => {
        el.innerText = formatted;
    });
}

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

window.closeServiceModal = function() { document.getElementById('serviceModal').classList.add('hidden'); };

window.filterServices = function() {
    const query = (document.getElementById('searchServiceInput')?.value || "").toLowerCase();
    const container = document.getElementById('serviceListContainer');
    container.innerHTML = '';
    
    let filtered = allServices.filter(s => String(s.serviceName).toLowerCase().includes(query));
    
    filtered.sort((a, b) => {
        const isFavA = isFavorite(a.serviceName) ? 1 : 0;
        const isFavB = isFavorite(b.serviceName) ? 1 : 0;
        if (isFavA !== isFavB) return isFavB - isFavA;
        return String(a.serviceName).localeCompare(String(b.serviceName));
    });

    if(filtered.length === 0) { container.innerHTML = '<div class="status-text-mini">Tidak ditemukan.</div>'; return; }

    filtered.forEach(svc => {
        const isActive = (String(svc.serviceID) === String(currentServiceId));
        const fav = isFavorite(svc.serviceName);
        const btn = document.createElement('div');
        btn.className = `modal-list-item ${isActive ? 'active' : ''}`;
        let formattedPrice = rpFormatter.format(svc.price);
        
        const safeName = String(svc.serviceName).replace(/'/g, "\\'");
        const starColor = fav ? '#f59e0b' : 'var(--text-secondary)';
        const starClass = fav ? 'fas fa-star' : 'far fa-star';

        btn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                <i class="${starClass}" style="color: ${starColor}; font-size: 15px; cursor: pointer; padding: 4px; flex-shrink: 0;" onclick="toggleFavorite('${safeName}', event)"></i>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${svc.serviceName}</span>
            </div>
            <div style="font-size:11.5px; color: ${isActive ? 'var(--primary-color)' : 'var(--success-color)'}; font-weight: 900; margin-left: 8px; flex-shrink: 0;">${formattedPrice}</div>
        `;
        
        btn.onclick = () => {
            currentServiceId = svc.serviceID; 
            currentServiceName = svc.serviceName; 
            currentServicePrice = svc.price;
            updateServiceButtonUI(); 
            closeServiceModal();
            checkCategoryAvailability(); 
            updateOperatorCardPrices();
        };
        container.appendChild(btn);
    });
};

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
    const grid = document.getElementById('operatorGrid');
    const hasCards = grid && grid.querySelector('.operator-card') !== null;
    if (!hasCards && grid) {
        grid.innerHTML = '<div class="status-text-mini" style="grid-column: 1 / -1;">Memuat Operator...</div>';
    }

    const res = await apiCall('getOperators', `&country_id=${currentCountryId}`);
    if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
        allOperators = res.data || []; 
        const fragment = document.createDocumentFragment();
        if (!allOperators.includes(currentOperator)) currentOperator = allOperators[0] || "random";
        
        const formattedPrice = rpFormatter.format(currentServicePrice || 0);
        const fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';

        allOperators.forEach(op => {
            const card = document.createElement("div"); 
            card.className = "operator-card"; 
            if (currentOperator === op) card.classList.add('selected');
            
            let displayName = op === "random" ? "ACAK" : op.toUpperCase();
            let logoImg = getOperatorLogo(op);
            
            card.innerHTML = `
                <div class="op-logo-container"><img src="${logoImg}" onerror="this.src='${fallbackImg}';" class="op-logo" alt="${displayName}"></div>
                <div class="op-name">${displayName}</div>
                <div class="op-price">${formattedPrice}</div>
            `;
            card.onclick = () => { 
                document.querySelectorAll('.operator-card').forEach(c => c.classList.remove('selected')); 
                card.classList.add('selected'); 
                currentOperator = op; 
                localStorage.setItem('otp_operator', currentOperator);
            };
            fragment.appendChild(card);
        });
        grid.replaceChildren(fragment);
        document.getElementById('btnOrder').disabled = false;
    } else if (!hasCards && grid) { 
        grid.innerHTML = '<div class="status-text-mini" style="color:var(--danger-color); grid-column: 1 / -1;">Gagal memuat operator.</div>'; 
    }
}

// === PEMESANAN NOMOR BARU ===
window.onOrderButtonClicked = async function() {
    const btn = document.getElementById('btnOrder');
    if (!btn) return;
    
    btn.disabled = true; btn.innerText = "MEMPROSES...";
    try {
        const res = await apiCall('get_order', `&operator_id=${currentOperator}&service_id=${currentServiceId}&country_id=${currentCountryId}`);
        if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
            const orderData = res.data || res;
            let oId = orderData.order_id || orderData.id;
            let oPhone = orderData.number || orderData.phone || orderData.phone_number;
            let finalPrice = orderData.price || currentServicePrice;
            
            if (oId && oPhone) {
                let serverOperator = orderData.operator || orderData.operator_name || orderData.operator_id;
                let opNameDisplay = currentOperator;
                
                if (serverOperator && String(serverOperator).toLowerCase() !== "random" && String(serverOperator).toLowerCase() !== "any") {
                    opNameDisplay = serverOperator;
                } else if (currentOperator === "random") {
                    opNameDisplay = guessOperator(oPhone);
                }
                
                const nowStamp = Date.now();
                activeOrders.unshift({ 
                    id: oId, phone: oPhone, serviceName: currentServiceName, operatorName: opNameDisplay, price: finalPrice, 
                    otp: null, status: "Waiting SMS", 
                    createdAt: nowStamp, 
                    expiresAt: nowStamp + (20 * 60 * 1000), 
                    originalExpiresAt: nowStamp + (20 * 60 * 1000),
                    hasReceivedOTP: false,
                    isResent: false
                });
                
                saveActiveOrders(); 
                fetchBalance();
                renderOrders(); 
                startPolling();
                startTimerTick();
                
                copyToClipboard(oPhone, "Pesanan Berhasil & Nomor Disalin!");
            } else { showToast("Format respons server tidak lengkap.", "error"); }
        } else { showToast(res.msg || "Gagal memesan nomor.", "error"); }
    } catch (e) { showToast("Error Eksekusi: " + e.message, "error");
    } finally { btn.disabled = false; btn.innerText = "PESAN NOMOR BARU"; }
};

function saveActiveOrders() { 
    localStorage.setItem(`otp_active_orders_${DEVICE_ID}`, JSON.stringify(activeOrders)); 
    localStorage.setItem('otp_active_orders', JSON.stringify(activeOrders)); 
}

// === KOTAK MENUNGGU OTP KOSONG PERMANEN ===
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

// === RENDER KARTU PESANAN AKTIF ===
function createOrderCard(order) {
    const now = Date.now(); 
    const card = document.createElement("div"); 
    card.className = "order-card"; 
    card.id = `order-card-${order.id}`;
    
    const isSuccess = (order.status === "Recieved" || order.status === "Done" || Boolean(order.otp));
    let opTag = String(order.operatorName || "ACAK").toUpperCase();
    let srvName = String(order.serviceName || currentServiceName || "LAYANAN").toUpperCase();
    const displayPrice = rpFormatter.format(order.price || 0);
    
    let otpHtml = isSuccess 
        ? `<div class="otp-title">KODE OTP</div><div class="otp-code" style="margin:0 !important; padding-right: 42px;">${formatOTP(order.otp)}</div><button class="btn-copy" onclick="copyToClipboard('${order.otp}', 'Kode OTP disalin!')" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="fas fa-copy"></i></button>` 
        : `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU SMS...</div>`;
        
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
        } else {
            cancelBtnAttr = ""; 
            replaceBtnAttr = ""; 
            resendBtnAttr = "disabled";
            finishBtnAttr = "disabled";
        }
    } 
    
    let headerLogoUrl = getOperatorLogo(order.operatorName); 
    let fallbackImg = 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';
    const left = order.expiresAt - now; 
    let timerColor = "var(--text-primary)"; 
    if (left <= 3 * 60000) { timerColor = "var(--danger-color)"; } 
    else if (left <= 5 * 60000) { timerColor = "var(--warning-color)"; }
    
    let m = Math.floor(Math.max(0, left)/60000); let s = Math.floor((Math.max(0, left)%60000)/1000);
    let timeStr = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
    
    card.innerHTML = `
        <div class="order-header">
            <div class="order-info-left" style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 26px; height: 26px; background: #fff; border-radius: 6px; padding: 2.5px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; border: 1px solid var(--border-color);">
                    <img src="${headerLogoUrl}" onerror="this.src='${fallbackImg}';" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="${opTag}">
                </div>
                <div style="text-align: left;">
                    <div class="order-id-label" style="display:inline-block; max-width: 195px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom;">#${order.id} (${srvName} • ${opTag})</div>
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
    container.replaceChildren(fragment);
}

// === WEB WORKER TIMER & PENGECEKAN WAKTU HABIS ===
function forceCheckOverdueOrders() {
    let needsRender = false;
    const now = Date.now();
    for (let i = activeOrders.length - 1; i >= 0; i--) {
        let o = activeOrders[i];
        if (!o.createdAt) o.createdAt = o.expiresAt - (20 * 60 * 1000);
        
        const left = o.expiresAt - now;
        if (left <= 0) {
            if (o.isResent || o.hasReceivedOTP || o.otp) {
                apiCall('set_status', `&order_id=${o.id}&status=4`); 
                saveToHistory(o, "SELESAI");
                recordStat('success');
            } else {
                apiCall('set_status', `&order_id=${o.id}&status=2`); 
                saveToHistory(o, "BATAL");
                recordStat('failed');
            }
            activeOrders.splice(i, 1); 
            needsRender = true;
        }
    }
    if (needsRender) { saveActiveOrders(); renderOrders(); }
}

function startTimerTick() {
    const runTick = () => {
        let needsRender = false;
        const now = Date.now();
        
        for (let i = activeOrders.length - 1; i >= 0; i--) {
            let o = activeOrders[i];
            if (!o.createdAt) o.createdAt = o.expiresAt - (20 * 60 * 1000); 
            
            const left = o.expiresAt - now;
            
            if (left <= 0) {
                if (o.isResent || o.hasReceivedOTP || o.otp) {
                    apiCall('set_status', `&order_id=${o.id}&status=4`); 
                    saveToHistory(o, "SELESAI");
                    recordStat('success');
                } else {
                    apiCall('set_status', `&order_id=${o.id}&status=2`); 
                    saveToHistory(o, "BATAL");
                    recordStat('failed');
                }
                activeOrders.splice(i, 1); 
                needsRender = true;
            } else {
                const timerEl = document.getElementById(`timer-${o.id}`);
                if (timerEl) {
                    let m = Math.floor(left / 60000); 
                    let s = Math.floor((left % 60000) / 1000);
                    timerEl.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
                    
                    if (left <= 3 * 60000) { timerEl.style.color = "var(--danger-color)"; } 
                    else if (left <= 5 * 60000) { timerEl.style.color = "var(--warning-color)"; }
                    else { timerEl.style.color = "var(--text-primary)"; }
                }
            }
        }
        if (needsRender) { saveActiveOrders(); renderOrders(); }
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

// === AKSI ORDER OTP CEPAT: BATAL, SELESAI, ULANG, GANTI & BATAL SEMUA ===
window.setOrderStatus = async function(orderId, statusCode) {
    const btnId = statusCode === 2 ? `btn-cancel-${orderId}` : `btn-finish-${orderId}`;
    const btn = document.getElementById(btnId);
    if(btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }

    let oIdx = activeOrders.findIndex(x => String(x.id) === String(orderId));
    if (oIdx === -1) return;
    let orderToSave = activeOrders[oIdx];

    try {
        const res = await apiCall('set_status', `&order_id=${orderId}&status=${statusCode}`);
        
        if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
            if (statusCode === 2) { saveToHistory(orderToSave, "BATAL"); recordStat('failed'); }
            if (statusCode === 4) { saveToHistory(orderToSave, "SELESAI"); recordStat('success'); }
            
            const card = document.getElementById(`order-card-${orderId}`);
            if (card) card.classList.add('removing');
            
            setTimeout(() => {
                activeOrders = activeOrders.filter(o => String(o.id) !== String(orderId));
                if (activeOrders.length <= 1) isDroplistOpen = false;
                saveActiveOrders();
                fetchBalance();
                showToast(statusCode === 2 ? "Pesanan Dibatalkan" : "Pesanan Selesai");
                renderOrders();
            }, 250);
        } else {
            showToast(res.msg || "Gagal mengubah status di server", "error");
            if(btn) { btn.disabled = false; btn.innerHTML = statusCode === 2 ? '<i class="fas fa-times"></i> Batal' : '<i class="fas fa-check"></i> Selesai'; }
        }
    } catch (e) { 
        showToast("Gagal memproses permintaan", "error"); 
        if(btn) { btn.disabled = false; btn.innerHTML = statusCode === 2 ? '<i class="fas fa-times"></i> Batal' : '<i class="fas fa-check"></i> Selesai'; }
    }
};

window.resendSpecificOrder = async function(id) {
    const btnResend = document.getElementById(`btn-resend-${id}`);
    if(btnResend) { btnResend.disabled = true; btnResend.innerHTML = '<div class="loader"></div>'; }
    
    try {
        const res = await apiCall('set_status', `&order_id=${id}&status=3`); 
        if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success" || (res.msg && String(res.msg).toLowerCase() === "success")) {
            showToast("Meminta kode SMS baru...");
            let idx = activeOrders.findIndex(o => String(o.id) === String(id));
            if (idx !== -1) {
                saveToHistory({ ...activeOrders[idx] }, "MINTA ULANG");
                
                activeOrders[idx].status = "Waiting SMS";
                activeOrders[idx].otp = null;
                activeOrders[idx].hasReceivedOTP = false; 
                activeOrders[idx].isResent = true; 
                
                saveActiveOrders();
            }
        } else { showToast("Gagal resend: " + (res.msg || "Error"), "error"); }
    } catch (e) { showToast("Error sistem: " + e.message, "error"); } 
    finally { renderOrders(); }
};

window.replaceSpecificOrder = async function(id) {
    const btnReplace = document.getElementById(`btn-replace-${id}`);
    if(btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = '<div class="loader"></div>'; }
    
    try {
        const oldOrder = activeOrders.find(o => String(o.id) === String(id));
        if (!oldOrder) return;

        let cancelRes = await apiCall('set_status', `&order_id=${id}&status=2`);
        if (cancelRes.status === "true" || cancelRes.status === true || cancelRes.status == 1 || String(cancelRes.status).toLowerCase() === "success") {
            saveToHistory(oldOrder, "GANTI");
            activeOrders = activeOrders.filter(o => String(o.id) !== String(id));
            showToast("Mencari nomor pengganti...");
            
            const res = await apiCall('get_order', `&operator_id=${currentOperator}&service_id=${currentServiceId}&country_id=${currentCountryId}`);
            
            if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
                const orderData = res.data || res;
                let oId = orderData.order_id || orderData.id;
                let oPhone = orderData.number || orderData.phone || orderData.phone_number;
                let finalPrice = orderData.price || currentServicePrice;
                
                if (oId && oPhone) {
                    let serverOperator = orderData.operator || orderData.operator_name || orderData.operator_id;
                    let opNameDisplay = currentOperator;
                    
                    if (serverOperator && String(serverOperator).toLowerCase() !== "random" && String(serverOperator).toLowerCase() !== "any") {
                        opNameDisplay = serverOperator;
                    } else if (currentOperator === "random") {
                        opNameDisplay = guessOperator(oPhone);
                    }
                    
                    const nowStamp = Date.now();
                    activeOrders.unshift({ 
                        id: oId, phone: oPhone, serviceName: currentServiceName, operatorName: opNameDisplay, price: finalPrice, 
                        otp: null, status: "Waiting SMS", 
                        createdAt: nowStamp, 
                        expiresAt: nowStamp + (20 * 60 * 1000), 
                        originalExpiresAt: nowStamp + (20 * 60 * 1000),
                        hasReceivedOTP: false,
                        isResent: false
                    });
                    
                    saveActiveOrders();
                    fetchBalance();
                    renderOrders();
                    copyToClipboard(oPhone, "Berhasil mendapat nomor baru & disalin!");
                }
            } else { showToast("Gagal mencari ganti: " + (res.msg || "Stok Kosong"), "error"); }
        } else {
            showToast("Gagal membatalkan nomor lama di server", "error");
        }
    } catch (e) { showToast("Error sistem: " + e.message, "error"); } 
    finally { renderOrders(); }
};

window.cancelAllOldOrders = async function() {
    if (activeOrders.length <= 1) return;
    const oldOrders = activeOrders.slice(1);
    const btnAll = document.getElementById("btn-cancel-all-old");
    if(btnAll) { btnAll.disabled = true; btnAll.innerHTML = '<div class="loader" style="width: 14px; height: 14px;"></div>'; }
    showToast(`Memproses ${oldOrders.length} pesanan lama...`, "warning");
    
    const cancelPromises = oldOrders.map(async (order) => {
        try { 
            let res = await apiCall('set_status', `&order_id=${order.id}&status=2`); 
            if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
                saveToHistory(order, "BATAL");
                recordStat('failed');
                return order.id;
            }
        } catch(e) {}
        return null; 
    });
    
    const results = await Promise.all(cancelPromises);
    const successfulIds = results.filter(id => id !== null);
    
    if (successfulIds.length > 0) {
        activeOrders = activeOrders.filter(o => !successfulIds.includes(o.id));
        if (activeOrders.length <= 1) isDroplistOpen = false;
        saveActiveOrders(); fetchBalance();
        showToast(`${successfulIds.length} pesanan berhasil dibatalkan.`, "success");
    } else {
        showToast("Gagal. Pesanan mungkin error di server atau sudah selesai.", "error");
    }
    
    if(btnAll) { btnAll.disabled = false; btnAll.innerHTML = `<i class="fas fa-trash-alt"></i> Batalkan Semua Pesanan Lama`; }
    renderOrders();
};

// === POLLING STATUS SMS OTP CEPAT ===
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    const runPoll = async () => {
        if (isPolling || activeOrders.length === 0) return;
        isPolling = true;
        let needsRender = false;
        let ordersToRemove = [];
        
        await Promise.all(activeOrders.map(async (o) => {
            if (o.status !== "Recieved" && o.status !== "Done") {
                try {
                    const res = await apiCall('get_status', `&order_id=${o.id}`);
                    if (res.status === "true" || res.status === true || res.status == 1 || String(res.status).toLowerCase() === "success") {
                        const stData = res.data || res;
                        const apiStatus = String(stData.status || "").toLowerCase();
                        const rawSms = stData.sms || stData.otp || stData.code || stData.pesan || "";
                        
                        if (rawSms || apiStatus.includes("recieved") || apiStatus.includes("received") || apiStatus.includes("done") || apiStatus.includes("success") || apiStatus.includes("sukses") || apiStatus === "2" || apiStatus === "4" || apiStatus.includes("ok")) {
                            o.status = "Recieved";
                            if (!o.hasReceivedOTP) {
                                o.hasReceivedOTP = true;
                                playNotifSound();
                            }
                            
                            let textSms = rawSms || "OTP DITERIMA";
                            let extracted = String(textSms).match(/\d{4,8}/);
                            o.otp = extracted ? extracted[0] : textSms;
                            
                            const phoneStr = normalizePhone(o.phone);
                            if (!usedNumbersDB.has(phoneStr)) { 
                                db.ref(`used_numbers/${STORAGE_PREFIX}`).push({ phone: phoneStr, timestamp: Date.now() }); 
                                usedNumbersDB.add(phoneStr); 
                            }
                            needsRender = true;
                        } else if (apiStatus.includes("cancel") || apiStatus.includes("failed") || apiStatus.includes("batal") || apiStatus === "3") {
                            ordersToRemove.push(o.id);
                            needsRender = true;
                        }
                    }
                } catch (e) {}
            }
        }));
        
        if (ordersToRemove.length > 0) {
            ordersToRemove.forEach(id => {
                let or = activeOrders.find(x => x.id === id);
                if(or) saveToHistory(or, "BATAL SERVER");
            });
            activeOrders = activeOrders.filter(o => !ordersToRemove.includes(o.id));
        }
        
        if (needsRender) {
            saveActiveOrders();
            renderOrders();
            fetchBalance();
        }
        isPolling = false;
    };
    
    runPoll(); 
    pollingInterval = setInterval(runPoll, 5000);
}

// === RIWAYAT PESANAN ===
function saveToHistory(order, finalStatus) { 
    if (!order) return; 
    const historyItem = { id: order.id, phone: order.phone, serviceName: order.serviceName, operatorName: order.operatorName, price: order.price, otp: order.otp || "-", status: finalStatus, date: Date.now() }; 
    orderHistory.unshift(historyItem); 
    if (orderHistory.length > 50) orderHistory.pop(); 
    localStorage.setItem(`otp_history_${DEVICE_ID}`, JSON.stringify(orderHistory)); 
    localStorage.setItem('otp_history', JSON.stringify(orderHistory)); 
    renderHistory(); 
}

window.openHistoryModal = function() { document.getElementById('historyModal').classList.remove('hidden'); history.pushState(null, null, "#history"); renderHistory(); };
window.closeHistoryModal = function() { document.getElementById('historyModal').classList.add('hidden'); };
window.clearHistory = function() { if(confirm("Bersihkan semua riwayat pesanan?")) { orderHistory = []; localStorage.removeItem(`otp_history_${DEVICE_ID}`); localStorage.removeItem('otp_history'); renderHistory(); } };

function renderHistory() {
    const list = document.getElementById('history-list'); if (!list) return;
    if (orderHistory.length === 0) { list.innerHTML = '<div class="status-text-mini">Belum ada riwayat lokal.</div>'; return; } 
    list.innerHTML = "";
    orderHistory.forEach(item => {
        const card = document.createElement('div'); 
        card.style = "background: var(--bg-card); padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 11px;";
        let statusColor = "var(--text-secondary)"; 
        let icon = "fa-clock";
        if (item.status === "SELESAI") { statusColor = "var(--success-color)"; icon = "fa-check-circle"; }
        if (item.status.includes("BATAL")) { statusColor = "var(--danger-color)"; icon = "fa-times-circle"; }
        if (item.status === "GANTI") { statusColor = "var(--warning-color)"; icon = "fa-sync-alt"; }
        if (item.status === "MINTA ULANG") { statusColor = "var(--info-color)"; icon = "fa-envelope"; }
        const dt = new Date(item.date); 
        const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} - ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
        const showOtp = (item.status === "SELESAI" || item.status === "MINTA ULANG") && item.otp && item.otp !== "-";

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="color: var(--text-primary); font-size: 13px; letter-spacing: 1px;">${formatPhoneNumber(item.phone)} <span style="font-size:9px; color:var(--text-secondary);">(${item.serviceName} • ${String(item.operatorName).toUpperCase()})</span></strong>
                <span style="color: ${statusColor}; font-weight: 900;"><i class="fas ${icon}"></i> ${item.status}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 10px; margin-bottom: ${showOtp ? '6px' : '0'};">
                <span>ID: #${item.id}</span><span>${timeStr}</span>
            </div>
            ${showOtp ? `<div style="background: var(--otp-bg); border: 1px dashed ${statusColor}; color: ${statusColor}; padding: 4px; text-align: center; border-radius: 6px; font-weight: 900; letter-spacing: 2px; font-size: 14px;">${item.otp}</div>` : ''}
        `;
        list.appendChild(card);
    });
}

// === INISIALISASI SAAT HALAMAN DIMUAT ===
window.onload = () => {
    initTheme();
    loadCustomNotificationSound();
    updateCountrySelectorUI();
    history.pushState(null, null, window.location.href);
    
    const catEl = document.getElementById('categorySelect');
    if (catEl) catEl.value = currentCategory;
    if (currentServiceName) {
        document.getElementById('btnServiceSelectText').innerText = currentServiceName.toUpperCase();
    }
    
    initUsedNumbersSync();
    renderOrders(); 
    initApp();
    startPolling(); 
    startTimerTick(); 
};
