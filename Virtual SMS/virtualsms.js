const BASE_URL = "https://hero-sms-proxy.masreno6pro.workers.dev"; 
const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

// Menggunakan Konfigurasi Firebase yang Sama Untuk Sinkronisasi Blacklist, Statistik, dan Catatan
const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); 
const DB_PATH = 'notes/public';

// Menambahkan API Key pada objek pengaturan
let appSettings = JSON.parse(localStorage.getItem('app_settings')) || { password: "Aku123..", autoCopy: true, apiKey: "" };
let activeAccountName = null; 
let activeOrders = []; 
let availableProducts = []; 
let selectedProductId = 'any'; 
let usedNumbersDB = new Set();
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

// === PENGATURAN MODAL ===
window.openSettingsModal = function() {
    document.getElementById('settingsPassword').value = appSettings.password;
    document.getElementById('settingsAutoCopy').checked = appSettings.autoCopy;
    document.getElementById('settingsApiKey').value = appSettings.apiKey || ""; // API Key
    document.getElementById('settingsModal').classList.remove('hidden');
}
window.closeSettingsModal = function() { document.getElementById('settingsModal').classList.add('hidden'); }
window.saveSettings = function() {
    appSettings.password = document.getElementById('settingsPassword').value;
    appSettings.autoCopy = document.getElementById('settingsAutoCopy').checked;
    appSettings.apiKey = document.getElementById('settingsApiKey').value; // Menyimpan API Key
    localStorage.setItem('app_settings', JSON.stringify(appSettings));
    closeSettingsModal(); 
    showToast("Pengaturan disimpan!"); 
}

// Interceptor API (Menyisipkan API Key Manual jika diperlukan di Header)
async function apiCall(endpoint, method = "GET", body = null) { 
    const options = { 
        method, 
        headers: { 
            "Content-Type": "application/json", 
            "X-Account-Name": activeAccountName,
            "Authorization": appSettings.apiKey ? `Bearer ${appSettings.apiKey}` : "" // Penggunaan manual API Key
        } 
    }; 
    if (body) options.body = JSON.stringify(body); 
    const response = await fetch(`${BASE_URL}${endpoint}`, options); 
    return await response.json(); 
}

// === LOGIKA LOGO DAN OPERATOR (XL DITAMPILKAN KEMBALI) ===
function getOperatorLogo(id) {
    const i = String(id).toLowerCase();
    if (i.includes('telkomsel')) return 'https://assets.telkomsel.com/public/app-logo/2021-06/telkomsel-logo.png';
    if (i.includes('indosat')) return 'https://im3-img.indosatooredoo.com/indosatassets/images/myim3_app_footer.svg';
    if (i.includes('xl')) return 'https://d17e22l2uh4h4n.cloudfront.net/corpweb/pub-xlaxiata/2019-03/xl-logo.png';
    if (i.includes('axis')) return 'https://www.axis.co.id/img/common/logo.svg';
    if (i.includes('three') || i.includes('tri')) return 'https://www.three.co.uk/content/dam/threedigital/static-files/components/header/three-logo.svg';
    if (i.includes('smartfren')) return 'https://down-id.img.susercontent.com/file/id-11134207-8224s-mkkmirlvdurn5d@resize_w900_nl.webp';
    return 'https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png'; 
}

// === LOGIKA CHECKLIST ACAK & GRID OPERATOR ===
window.toggleRandomOperator = function() {
    const chk = document.getElementById('chkRandomOp');
    if (chk.checked) {
        // Hilangkan seleksi dari grid manual
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
        selectedProductId = 'any';
        localStorage.setItem('virtual_selected_operator', 'any');
    } else {
        // Jika di-uncheck tapi tidak ada manual yang terpilih, otomatis pilih yang pertama
        if(selectedProductId === 'any' && availableProducts.length > 1) {
            const firstManual = availableProducts.find(p => p.id !== 'any');
            if(firstManual) {
                selectedProductId = firstManual.id;
                document.getElementById(`op-card-${firstManual.id}`).classList.add('selected');
            }
        }
    }
    const btnOrder = document.getElementById('btnOrder');
    if (btnOrder) btnOrder.disabled = false;
}

async function loadVirtualSMSProducts() {
    try {
        const productList = document.getElementById('productList');
        productList.innerHTML = '<div class="status-text">Mencari Operator...</div>';
        
        const productsRes = await apiCall(`/catalog/products`);
        if (productsRes.success && productsRes.data.length > 0) {
            let ops = productsRes.data; 
            
            // PENTING: XL TIDAK DIFILTER DI SINI. Opsi acak (any) disaring untuk dipisah logikanya
            let specificOps = ops.filter(o => o.id !== 'any' && o.id !== '');
            
            let cheapestPrice = 0;
            if (specificOps.length > 0) { 
                specificOps.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)); 
                cheapestPrice = specificOps[0].price; // Mengambil harga termurah
            }
            
            // Set harga acak termurah ke dalam Checklist Badge
            document.getElementById('randomPriceBadge').innerText = usdFormatter.format(cheapestPrice);
            
            // Simpan operator any dan lainnya ke variabel global
            availableProducts = [{ id: 'any', price: cheapestPrice }, ...specificOps]; 
            
            productList.innerHTML = ''; // Kosongkan placeholder

            let savedOp = localStorage.getItem('virtual_selected_operator') || 'any';
            selectedProductId = savedOp;

            // Atur status centang Checklist "Acak" berdasarkan riwayat memori
            const chkRandom = document.getElementById('chkRandomOp');
            if (selectedProductId === 'any') { chkRandom.checked = true; } else { chkRandom.checked = false; }
            
            if (document.getElementById('btnOrder')) document.getElementById('btnOrder').disabled = false;
            
            // Render HANYA daftar operator spesifik ke dalam Grid (Tanpa Acak)
            specificOps.forEach(product => {
                const card = document.createElement("div"); 
                card.className = "product-card"; 
                card.id = `op-card-${product.id}`;
                if (selectedProductId === product.id) card.classList.add('selected');
                
                let opName = product.id.toUpperCase();
                let logoImg = getOperatorLogo(product.id); 
                
                card.innerHTML = `<div class="op-logo-container"><img src="${logoImg}" onerror="this.onerror=null; this.src='https://cdn.creazilla.com/emojis/56624/shuffle-tracks-button-emoji-clipart-md.png';" class="op-logo" alt="${opName}"></div><div class="product-info"><h4>${opName}</h4></div><div class="product-price">${usdFormatter.format(product.price)}</div>`;
                
                // Ketika klik grid manual
                card.onclick = () => { 
                    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); 
                    card.classList.add('selected'); 
                    
                    // Otomatis hilangkan centang "Acak" saat manual dipilih
                    document.getElementById('chkRandomOp').checked = false;
                    
                    selectedProductId = product.id; 
                    localStorage.setItem('virtual_selected_operator', product.id); 
                    if (document.getElementById('btnOrder')) document.getElementById('btnOrder').disabled = false; 
                };
                productList.appendChild(card);
            });
        }
    } catch (error) { document.getElementById('productList').innerHTML = `<div class="status-text" style="color:var(--danger-color);">Error muat data.</div>`; }
}

// Inisialisasi Fungsi-fungsi inti (Sama seperti arsitektur HeroSMS)
// Sinkronisasi Database ke jalur yang sama (hero_sms) untuk menggabungkan Blacklist dan Statistik
function initUsedNumbersSync() {
    db.ref('used_numbers/hero_sms').on('value', snapshot => {
        usedNumbersDB.clear(); 
        if (snapshot.exists()) {
            snapshot.forEach(child => { if (child.val().phone) usedNumbersDB.add(child.val().phone); });
        }
    });
}
function showToast(pesan, type = "success") { const t = document.getElementById("toast"); if(!t) return; t.innerHTML = pesan; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 4000); }

window.onload = () => { 
    initUsedNumbersSync();
    loadVirtualSMSProducts(); 
    // Sisanya akan memanggil init logic order (Sama persis seperti HeroSMS Script)
};
