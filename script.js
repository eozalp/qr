document.addEventListener('DOMContentLoaded', () => {
    const panes = document.querySelectorAll('.pane');
    const navButtons = document.querySelectorAll('.nav-button');

    // const qrPane = document.getElementById('qr-pane'); // Not strictly needed if not used directly
    // const settingsPane = document.getElementById('settings-pane'); // Not strictly needed

    // QR Pane elements
    const video = document.getElementById('camera-feed');
    const qrCanvasElement = document.getElementById('qr-canvas');
    const qrCanvas = qrCanvasElement.getContext('2d', { willReadFrequently: true });
    const scanFeedback = document.getElementById('scan-feedback');
    const startScanButton = document.getElementById('start-scan-button');
    
    // QR Pane için anlık sonuç elementleri
    const qrPaneRawData = document.getElementById('qr-pane-raw-data');
    const qrPaneCalcResult = document.getElementById('qr-pane-calc-result');

    // Tarama Tarihi Paneli için liste konteyneri
    const scanHistoryListContainer = document.getElementById('scan-history-list');

    // Settings Pane elements
    const delimiterInput = document.getElementById('delimiter-input');
    const formulaInput = document.getElementById('formula-input');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const settingsFeedback = document.getElementById('settings-feedback'); // This ID is in the HTML

    let currentSettings = {
        delimiter: ',',
        formula: 'A + B'
    }; // localStorage'dan yüklenecek
    let scanning = false;
    let scanHistory = [];
    const MAX_HISTORY_ITEMS = 20; // Maksimum geçmiş öğesi sayısı
    let stream = null;

    // --- PWA Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => { // Changed to Turkish console log for consistency, though users won't see this
                console.log('Service Worker başarıyla kaydedildi, kapsam:', registration.scope);
            })
            .catch(error => { // Changed to Turkish console log
                console.error('Service Worker kaydı başarısız oldu:', error);
            });
    }

    // --- Navigation ---
    function setActivePane(paneId) {
        panes.forEach(pane => {
            pane.classList.toggle('active', pane.id === paneId);
        });
        navButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.pane === paneId);
        });

        if (paneId === 'qr-pane' && !scanning && !stream) {
            // Optionally auto-start scan when navigating to QR pane
            // startQrScan(); 
        } else if (paneId !== 'qr-pane' && scanning) {
            stopQrScan(); // Stop scan if navigating away
        }
    }

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            setActivePane(button.dataset.pane);
        });
    });

    // --- Settings ---
    function loadSettings() {
        const savedSettings = localStorage.getItem('alvetakQrSettings'); // Anahtar adını kontrol et/güncelle
        if (savedSettings) {
            currentSettings = JSON.parse(savedSettings);
        }
        delimiterInput.value = currentSettings.delimiter || ',';
        formulaInput.value = currentSettings.formula || 'A + B';
    }

    function saveSettings() {
        currentSettings.delimiter = delimiterInput.value.trim() || ','; 
        currentSettings.formula = formulaInput.value.trim();
        localStorage.setItem('alvetakQrSettings', JSON.stringify(currentSettings)); // Anahtar adını kontrol et/güncelle
        settingsFeedback.textContent = 'Ayarlar kaydedildi!';
        setTimeout(() => { settingsFeedback.textContent = ''; }, 3000);
    }

    saveSettingsButton.addEventListener('click', saveSettings);

    // --- QR Code Scanning ---
    async function startQrScan() {
        if (scanning || stream) return; // Already scanning or stream active

        try {
            scanFeedback.textContent = 'Kamera erişimi isteniyor...';
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                qrCanvasElement.height = video.videoHeight;
                qrCanvasElement.width = video.videoWidth;
                scanning = true;
                scanFeedback.textContent = 'QR kodu taranıyor...';
                startScanButton.textContent = 'Taramayı Durdur';
                requestAnimationFrame(tick);
            };
        } catch (err) {
            console.error("Kamera erişim hatası: ", err);
            scanFeedback.textContent = `Kamera erişim hatası: ${err.name}. İzin verildiğinden emin olun.`;
            scanning = false;
            stream = null;
        }
    }

    function stopQrScan() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        scanning = false;
        video.srcObject = null;
        scanFeedback.textContent = 'Tarayıcı durduruldu. Başlamak için "Taramayı Başlat" düğmesine tıklayın.';
        startScanButton.textContent = 'Taramayı Başlat';
    }
    
    startScanButton.addEventListener('click', () => {
        if (scanning) {
            stopQrScan();
        } else {
            startQrScan();
        }
    });


    function tick() {
        if (!scanning || !video.srcObject || video.readyState !== video.HAVE_ENOUGH_DATA) {
            if (scanning) requestAnimationFrame(tick); // Keep trying if scanning is true but video not ready
            return;
        }

        qrCanvas.drawImage(video, 0, 0, qrCanvasElement.width, qrCanvasElement.height);
        const imageData = qrCanvas.getImageData(0, 0, qrCanvasElement.width, qrCanvasElement.height);
        
        // jsQR is globally available from the CDN script
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            scanFeedback.textContent = 'QR Kodu Algılandı!';
            processQrData(code.data);
            // stopQrScan(); // Optional: stop scan after first detection
            // To allow continuous scanning, remove stopQrScan() and provide feedback
            // For now, let's keep scanning until user stops or navigates away
            // To avoid immediate re-scan of the same code, add a small delay or a "scan again" button
            // For this version, we'll just update and continue scanning.
        } else {
            // scanFeedback.textContent = 'QR kodu taranıyor...'; // Keep this updating only if no code found, or rely on initial message
        }
        if (scanning) { // Only continue if scanning is still active
            requestAnimationFrame(tick);
        }
    }

    // --- Scan History ---
    function loadHistory() {
        const savedHistory = localStorage.getItem('alvetakQrScanHistory');
        if (savedHistory) {
            scanHistory = JSON.parse(savedHistory);
        }
        renderScanHistory();
    }

    function saveHistory() {
        localStorage.setItem('alvetakQrScanHistory', JSON.stringify(scanHistory));
    }

    function addScanToHistory(scanEntry) {
        scanHistory.unshift(scanEntry); // Add to the beginning (newest first)
        if (scanHistory.length > MAX_HISTORY_ITEMS) {
            scanHistory.pop(); // Remove the oldest item if limit exceeded
        }
        saveHistory();
        renderScanHistory();
    }

    function renderScanHistory() {
        if (!scanHistoryListContainer) return;

        scanHistoryListContainer.innerHTML = ''; // Clear previous list

        if (scanHistory.length === 0) {
            scanHistoryListContainer.innerHTML = '<p>Henüz tarama yapılmadı.</p>';
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'history-items-list'; // Styling için class

        scanHistory.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'history-item'; // Styling için class
            li.innerHTML = `
                <div class="info-item">
                    <strong>Tarama Zamanı:</strong>
                    <p>${new Date(entry.timestamp).toLocaleString('tr-TR')}</p>
                </div>
                <div class="info-item">
                    <strong>Ham QR Verisi:</strong>
                    <pre>${entry.rawData}</pre>
                </div>
                <div class="info-item">
                    <strong>Ayrıştırılmış Veri (A, B, C...):</strong>
                    <pre>${entry.parsedDataDisplay}</pre>
                </div>
                <div class="info-item">
                    <strong>Hesaplama Sonucu:</strong>
                    <p>${entry.calculationResultText}</p>
                </div>
            `;
            ul.appendChild(li);
        });
        scanHistoryListContainer.appendChild(ul);
    }

    // --- Data Processing and Calculation ---
    function processQrData(rawData) {
        const timestamp = new Date();
        // QR Tara Paneli için
        qrPaneRawData.textContent = rawData;

        const delimiter = currentSettings.delimiter || ','; // Fallback delimiter
        const formula = currentSettings.formula;

        if (!formula) {
            const noFormulaMsg = "Yok (Ayarlarda formül tanımlanmamış)";
            qrPaneCalcResult.textContent = noFormulaMsg;
            // Geçmişe de bu bilgiyle ekleyebiliriz veya boş bırakabiliriz. Şimdilik ekleyelim.
            addScanToHistory({ timestamp: timestamp.toISOString(), rawData, parsedDataDisplay: "N/A", calculationResultText: noFormulaMsg });
            return;
        }

        const dataParts = rawData.split(delimiter).map(s => s.trim());
        
        let parsedDataDisplay = "";
        const argValues = [];
        const argNames = [];

        dataParts.forEach((part, index) => {
            const letter = String.fromCharCode(65 + index); // A, B, C...
            if (index < 26) { // Max 26 variables (A-Z)
                parsedDataDisplay += `${letter}: ${part}\n`;
                argNames.push(letter);
                // Try to convert to number, if fails, keep as string (though calculations might fail)
                const numValue = parseFloat(part);
                argValues.push(isNaN(numValue) ? part : numValue); 
            }
        });
        const finalParsedDataDisplay = parsedDataDisplay || "Veri parçaları bulunamadı veya ayırıcı sorunu.";

        if (argValues.length === 0) {
            const noDataMsg = "Hesaplanacak veri yok.";
            qrPaneCalcResult.textContent = noDataMsg;
            addScanToHistory({ timestamp: timestamp.toISOString(), rawData, parsedDataDisplay: finalParsedDataDisplay, calculationResultText: noDataMsg });
            return;
        }
        
        let calculationResultText = "Hesaplama yapılamadı."; // Default

        try {
            // Sanitize formula: allow only A-Z, numbers, and basic math operators
            // This is a very basic sanitization, for more complex scenarios a proper parser is better
            const sanitizedFormula = formula.replace(/[^A-Za-z0-9\s\.\+\-\*\/\(\)]/g, '');
            if (sanitizedFormula !== formula) {
                 console.warn("Formula was sanitized. Original:", formula, "Sanitized:", sanitizedFormula);
            }

            // Create the function with named arguments A, B, C...
            // Example: if formula is "A + B" and dataParts are ["10", "20"],
            // this creates new Function("A", "B", "return A + B;")
            // And calls it with (10, 20)
            const calculator = new Function(...argNames, `return ${sanitizedFormula};`);
            const result = calculator(...argValues.slice(0, argNames.length)); // Pass only as many values as there are argNames

            if (typeof result === 'number' && !isNaN(result)) {
                calculationResultText = result.toLocaleString('tr-TR');
            } else {
                calculationResultText = `Sonuç: ${result} (Formülü/veriyi kontrol edin)`;
            }
        } catch (e) {
            console.error("Hesaplama hatası:", e);
            calculationResultText = `Hata: ${e.message}. Formül/veri türlerini kontrol edin.`;
        }

        qrPaneCalcResult.textContent = calculationResultText;
        addScanToHistory({ timestamp: timestamp.toISOString(), rawData, parsedDataDisplay: finalParsedDataDisplay, calculationResultText });
    }

    // --- Initialization ---
    loadSettings();
    loadHistory(); // Load history on startup
    setActivePane('qr-pane'); // Start with QR pane
    // Consider not auto-starting scan to save battery, let user click "Start Scan"
    // startQrScan(); // Uncomment if you want to auto-start scan
});
