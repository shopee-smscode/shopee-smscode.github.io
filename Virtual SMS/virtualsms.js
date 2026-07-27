document.addEventListener("DOMContentLoaded", () => {
    // State Aplikasi
    let currentPolling = null;
    let currentOrderId = null;
    let currentNumber = null;
    let isPolling = false;

    // Elemen DOM
    const serviceButtons = document.querySelectorAll(".service-btn");
    const chatContainer = document.getElementById("chatContainer");
    const actionButtons = document.getElementById("actionButtons");
    const activeNumberSpan = document.getElementById("activeNumber");

    const btnCancel = document.getElementById("btnCancel");
    const btnResend = document.getElementById("btnResend");
    const btnChange = document.getElementById("btnChange");

    // 1. Inisialisasi Event Listener
    serviceButtons.forEach(button => {
        button.addEventListener("click", () => startOrder(button));
    });

    // 2. Fungsi Utama: Memulai Pesanan
    async function startOrder(buttonElement) {
        // Reset status tombol
        serviceButtons.forEach(btn => btn.classList.remove("active"));
        buttonElement.classList.add("active");
        
        const serviceName = buttonElement.getAttribute("data-service");
        
        // Reset state
        stopPolling();
        actionButtons.style.display = "none";
        activeNumberSpan.innerText = "";
        
        addMessage(`Memesan nomor baru untuk <strong>${serviceName}</strong> dari sistem...`, "Memproses");

        try {
            // Simulasi panggilan API pemesanan nomor
            const orderData = await orderNewNumberAPI(serviceName);
            currentOrderId = orderData.orderId;
            currentNumber = orderData.number;

            // Update UI
            activeNumberSpan.innerText = `(${currentNumber})`;
            addMessage(`Nomor siap: <strong>${currentNumber}</strong><br>Menunggu balasan SMS untuk <strong>${serviceName}</strong>...`, "Waktu tersisa: 15:00");
            
            // Tampilkan tombol aksi dan mulai polling
            actionButtons.style.display = "grid";
            startPolling(currentOrderId);

        } catch (error) {
            addMessage(`Gagal memesan nomor: ${error.message}`, "Error", true);
        }
    }

    // 3. Sistem Polling (Mengecek OTP yang masuk)
    function startPolling(orderId) {
        isPolling = true;
        let attempts = 0;

        currentPolling = setInterval(async () => {
            if (!isPolling) return;
            attempts++;

            try {
                const status = await checkOTPStatusAPI(orderId);

                if (status.status === "RECEIVED") {
                    stopPolling();
                    displayOTP(status.otpCode);
                    saveDailyStatistic(orderId, "SUCCESS"); // Simpan ke Database
                } else if (attempts > 30) {
                    stopPolling();
                    addMessage("Waktu tunggu habis. Silakan minta ulang atau ganti nomor.", "Timeout");
                }
            } catch (error) {
                console.error("Kesalahan saat polling:", error);
            }
        }, 3000); // interval 3 detik
    }

    function stopPolling() {
        isPolling = false;
        if (currentPolling) clearInterval(currentPolling);
    }

    // 4. Logika Tombol Aksi Mandiri
    btnCancel.addEventListener("click", async () => {
        if (!currentOrderId) return;
        stopPolling();
        await cancelOrderAPI(currentOrderId);
        addToBlacklist(currentNumber);
        
        addMessage("Pesanan dibatalkan. Nomor dimasukkan ke dalam daftar <em>blacklist</em>.", "Dibatalkan");
        actionButtons.style.display = "none";
        activeNumberSpan.innerText = "";
    });

    btnResend.addEventListener("click", () => {
        if (!currentOrderId) return;
        addMessage("Meminta ulang SMS... Memulai ulang timer.", "Menunggu");
        startPolling(currentOrderId);
    });

    btnChange.addEventListener("click", () => {
        if (!currentOrderId) return;
        stopPolling();
        addToBlacklist(currentNumber);
        addMessage("Mengganti nomor... Nomor sebelumnya di-blacklist.", "Sistem");
        
        // Memicu pesanan baru menggunakan layanan yang sedang aktif
        const activeService = document.querySelector(".service-btn.active");
        if (activeService) startOrder(activeService);
    });

    // 5. Fungsi Render UI Dinamis
    function addMessage(content, time, isError = false) {
        const msgDiv = document.createElement("div");
        msgDiv.className = "message incoming";
        if (isError) {
            msgDiv.style.backgroundColor = "var(--danger)";
            msgDiv.style.color = "white";
        }
        
        msgDiv.innerHTML = `
            <div class="message-content">${content}</div>
            <div class="message-time">${time}</div>
        `;
        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll
    }

    function displayOTP(otpCode) {
        const otpElement = document.createElement("div");
        otpElement.className = "message received-otp";
        const copyId = `copy-${Date.now()}`;
        
        otpElement.innerHTML = `
            <div class="message-content">
                Kode OTP Anda: <strong class="otp-code">${otpCode}</strong>
                <br><small style="cursor:pointer; margin-top:6px; display:inline-block;" id="${copyId}">📋 Klik untuk Salin</small>
            </div>
            <div class="message-time">Berhasil</div>
        `;
        chatContainer.appendChild(otpElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Fungsionalitas Salin Otomatis (Auto-Copy)
        document.getElementById(copyId).addEventListener("click", () => {
            navigator.clipboard.writeText(otpCode).then(() => {
                alert("Kode OTP berhasil disalin!");
            });
        });
    }

    // ==========================================
    // 6. Mock API & Simulasi Database Firebase
    // ==========================================
    function orderNewNumberAPI(service) {
        return new Promise((resolve) => {
            setTimeout(() => resolve({ 
                orderId: "ORD" + Date.now(), 
                number: "+62 812-" + Math.floor(1000 + Math.random() * 9000) + "-" + Math.floor(1000 + Math.random() * 9000) 
            }), 800);
        });
    }

    function checkOTPStatusAPI(orderId) {
        return new Promise((resolve) => {
            // Simulasi: 15% probabilitas SMS masuk pada tiap siklus polling
            const isReceived = Math.random() > 0.85; 
            setTimeout(() => {
                if (isReceived) resolve({ status: "RECEIVED", otpCode: Math.floor(100000 + Math.random() * 900000) });
                else resolve({ status: "WAITING" });
            }, 500);
        });
    }

    function cancelOrderAPI(orderId) {
        return new Promise(resolve => setTimeout(resolve, 400));
    }

    function addToBlacklist(number) {
        console.log(`[Firebase Database] Menyimpan ${number} ke tabel 'Blacklist'.`);
    }

    function saveDailyStatistic(orderId, status) {
        console.log(`[Firebase Database] Mencatat statistik harian: Order ID ${orderId} | Status: ${status}`);
    }
});
