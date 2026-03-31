const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

let activeOrders = JSON.parse(localStorage.getItem('shopee_orders')) || [];
let selectedProductId = null;

const productList = document.getElementById('productList');
const btnOrder = document.getElementById('btnOrder');
const activeOrdersContainer = document.getElementById('activeOrdersContainer');

// --- LOGIKA UTAMA ---

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

// Simpan ke LocalStorage agar tidak hilang saat refresh
function saveToStorage() {
    localStorage.setItem('shopee_orders', JSON.stringify(activeOrders));
    renderOrders();
}

// Fungsi Salin Nomor
function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert("Nomor berhasil disalin!");
}

// Memuat Produk Shopee
async function loadProducts() {
    try {
        const countriesRes = await apiCall('/catalog/countries');
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        productList.innerHTML = "";
        productsRes.data.forEach(product => {
            const card = document.createElement("div");
            card.className = "product-card";
            card.innerHTML = `<div><h4>Server ${product.id}</h4><p>Stok: ${product.available}</p></div><div class="product-price">Rp ${product.price}</div>`;
            card.onclick = () => {
                document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedProductId = product.id;
                btnOrder.disabled = false;
            };
            productList.appendChild(card);
        });
    } catch (e) { productList.innerHTML = "Gagal memuat produk."; }
}

// Memesan Nomor Baru
btnOrder.onclick = async () => {
    btnOrder.disabled = true;
    try {
        const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(selectedProductId), quantity: 1 });
        if (res.success) {
            const newOrder = {
                id: res.data.orders[0].id,
                phone: res.data.orders[0].phone_number,
                otp: "-",
                status: "Menunggu SMS",
                expiry: Date.now() + (20 * 60 * 1000) // 20 Menit dari sekarang
            };
            activeOrders.push(newOrder);
            saveToStorage();
        }
    } catch (e) { alert("Gagal pesan nomor."); }
    btnOrder.disabled = false;
};

// Render daftar pesanan ke layar
function renderOrders() {
    if (activeOrders.length === 0) {
        activeOrdersContainer.innerHTML = '<div class="status-text">Tidak ada pesanan aktif.</div>';
        return;
    }

    activeOrdersContainer.innerHTML = "";
    activeOrders.forEach(order => {
        const card = document.createElement("div");
        card.className = "order-card";
        card.innerHTML = `
            <div class="order-header">
                <span class="status-label">ID: ${order.id}</span>
                <span class="timer" id="timer-${order.id}">--:--</span>
            </div>
            <div class="phone-row">
                <span class="phone-number">${order.phone}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button>
            </div>
            <div class="status-label">Status: ${order.status}</div>
            <div class="otp-display">
                <div class="otp-code">${order.otp}</div>
            </div>
            <div class="action-buttons">
                <button class="btn-danger" onclick="cancelOrder(${order.id})">Batalkan</button>
                <button class="btn-success" onclick="finishOrder(${order.id})">Selesai</button>
            </div>
        `;
        activeOrdersContainer.appendChild(card);
    });
}

// Fungsi Update Timer & Auto-Close
setInterval(() => {
    activeOrders.forEach((order, index) => {
        const now = Date.now();
        const diff = order.expiry - now;

        if (diff <= 0) {
            // Jika waktu habis, hapus otomatis
            activeOrders.splice(index, 1);
            saveToStorage();
        } else {
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            const timerEl = document.getElementById(`timer-${order.id}`);
            if (timerEl) timerEl.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        }
    });
}, 1000);

// Polling Status OTP untuk semua pesanan
setInterval(async () => {
    for (let order of activeOrders) {
        if (order.status === "OTP_RECEIVED") continue;
        try {
            const res = await apiCall(`/orders/${order.id}`);
            if (res.success) {
                order.status = res.data.status;
                if (res.data.otp_code) order.otp = res.data.otp_code;
                if (order.status === "CANCELED" || orderStatus === "EXPIRED") {
                    activeOrders = activeOrders.filter(o => o.id !== order.id);
                }
                saveToStorage();
            }
        } catch (e) {}
    }
}, 5000);

// Fungsi Hapus/Selesai/Batal
async function cancelOrder(id) {
    if (!confirm("Batalkan pesanan ini? Saldo akan kembali.")) return;
    try {
        await apiCall('/orders/cancel', 'POST', { id });
        activeOrders = activeOrders.filter(o => o.id !== id);
        saveToStorage();
    } catch (e) {}
}

async function finishOrder(id) {
    // Sesuai permintaan: Membersihkan semua bagian pesanan tersebut
    try {
        await apiCall('/orders/finish', 'POST', { id });
    } catch (e) {}
    activeOrders = activeOrders.filter(o => o.id !== id);
    saveToStorage();
}

window.onload = () => {
    loadProducts();
    renderOrders();
};
