document.addEventListener('DOMContentLoaded', () => {
    const panes = document.querySelectorAll('.pane');
    const navButtons = document.querySelectorAll('.nav-button');

    // Scan Pane elements (formerly QR Pane)
    const video = document.getElementById('camera-feed');
    // QuaggaJS will manage its own canvas for overlays, so qr-canvas is removed.
    const scanFeedback = document.getElementById('scan-feedback');
    const startScanButton = document.getElementById('start-scan-button');
    
    // Scan Pane için anlık sonuç elementleri
    const scanPaneRawData = document.getElementById('qr-pane-raw-data'); // ID in HTML is qr-pane-raw-data
    const scanPaneCalcResult = document.getElementById('qr-pane-calc-result'); // ID in HTML is qr-pane-calc-result

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

        if (paneId === 'scan-pane' && !scanning && !stream) { // Updated pane ID
            // Optionally auto-start scan when navigating to scan pane
            // startBarcodeScan(); 
        } else if (paneId !== 'scan-pane' && scanning) { // Updated pane ID
            stopBarcodeScan(); // Stop scan if navigating away
        }
    }

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            setActivePane(button.dataset.pane);
        });
    });

    // --- Settings ---
    function loadSettings() {
        const savedSettings = localStorage.getItem('alvetakBarcodeSettings'); // Key name updated
        if (savedSettings) {
            currentSettings = JSON.parse(savedSettings);
        }
        delimiterInput.value = currentSettings.delimiter || ',';
        formulaInput.value = currentSettings.formula || 'A + B';
    }

    function saveSettings() {
        currentSettings.delimiter = delimiterInput.value.trim() || ','; 
        currentSettings.formula = formulaInput.value.trim();
        localStorage.setItem('alvetakBarcodeSettings', JSON.stringify(currentSettings)); // Key name updated
        settingsFeedback.textContent = 'Ayarlar kaydedildi!';
        setTimeout(() => { settingsFeedback.textContent = ''; }, 3000);
    }

    saveSettingsButton.addEventListener('click', saveSettings);

    // --- Barcode Scanning (using QuaggaJS) ---
    async function startBarcodeScan() {
        if (scanning || stream) return; // Already scanning or stream active

        try {
            scanFeedback.textContent = 'Kamera erişimi isteniyor...';
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            video.srcObject = stream;
            // Ensure video is playing before starting Quagga
            await video.play(); 

            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: video, // Use the existing video element
                    constraints: {
                        width: { min: 640 },
                        height: { min: 480 },
                        aspectRatio: { min: 1, max: 2 },
                        facingMode: "environment"
                    },
                    area: { // Defines rectangle of detection
                        top: "20%",    // E.g. 20% from the top
                        right: "10%",  // E.g. 10% from the right
                        left: "10%",   // E.g. 10% from the left
                        bottom: "20%"  // E.g. 20% from the bottom
                    }
                },
                decoder: {
                    readers: [
                        "code_128_reader",
                        "ean_reader",
                        "ean_8_reader",
                        "code_39_reader",
                        "code_39_vin_reader",
                        "codabar_reader",
                        "upc_reader",
                        "upc_e_reader",
                        "i2of5_reader"
                    ],
                    debug: {
                        showCanvas: true,
                        showPatches: true,
                        showFoundPatches: true,
                        showSkeleton: true,
                        showLabels: true,
                        showPatchLabels: true,
                        showRemainingPatchLabels: true,
                        boxFromPatches: {
                            showTransformed: true,
                            showTransformedBox: true,
                            showBB: true
                        }
                    }
                },
                locate: true, // try to locate barcode in image
                locator: {
                    patchSize: "medium", // "x-small", "small", "medium", "large", "x-large"
                    halfSample: true
                },
                numOfWorkers: navigator.hardwareConcurrency || 2,
                frequency: 10, // Scans per second
            }, function(err) {
                if (err) {
                    console.error("QuaggaJS başlatma hatası: ", err);
                    scanFeedback.textContent = `Kamera/Quagga başlatma hatası: ${err.message || err}`;
                    stopBarcodeScan(); // Clean up
                    return;
                }
                console.log("QuaggaJS başlatıldı. Taramaya başlanıyor.");
                Quagga.start();
                scanning = true;
                scanFeedback.textContent = 'Barkod taranıyor...';
                startScanButton.textContent = 'Taramayı Durdur';
            });

            Quagga.onDetected(onBarcodeDetected);
            Quagga.onProcessed(onBarcodeProcessed); // For drawing debug boxes

        } catch (err) {
            console.error("Kamera erişim hatası: ", err);
            scanFeedback.textContent = `Kamera erişim hatası: ${err.name}. İzin verildiğinden emin olun.`;
            scanning = false;
            stream = null;
        }
    }

    function onBarcodeProcessed(result) {
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
            if (result.boxes) {
                drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                result.boxes.filter(box => box !== result.box).forEach(box => {
                    Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { color: "green", lineWidth: 2 });
                });
            }
            if (result.box) {
                Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, { color: "blue", lineWidth: 2 });
            }
            if (result.codeResult && result.codeResult.code) {
                // Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {color: 'red', lineWidth: 3});
            }
        }
    }

    function onBarcodeDetected(result) {
        if (!scanning) return; // Avoid processing if already stopped

        const code = result.codeResult.code;
        if (code) {
            scanFeedback.textContent = 'Barkod Algılandı!';
            Quagga.pause(); // Pause Quagga to prevent multiple detections of the same barcode
            processBarcodeData(code);
            stopBarcodeScan(); // Stop camera and Quagga fully after processing
            scanFeedback.textContent = 'Barkod okundu ve işlendi. Yeni tarama için "Taramayı Başlat" düğmesine tıklayın.';
        }
    }

    function stopBarcodeScan() {
        if (scanning) Quagga.stop(); // Stop Quagga if it was initialized
        scanning = false;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        video.srcObject = null;
        scanFeedback.textContent = 'Tarayıcı durduruldu. Başlamak için "Taramayı Başlat" düğmesine tıklayın.';
        startScanButton.textContent = 'Taramayı Başlat';
    }
    
    startScanButton.addEventListener('click', () => {
        if (scanning) {
            stopBarcodeScan();
        } else {
            startBarcodeScan();
        }
    });

    // --- Scan History ---
    function loadHistory() {
        const savedHistory = localStorage.getItem('alvetakBarcodeScanHistory'); // Key name updated
        if (savedHistory) {
            scanHistory = JSON.parse(savedHistory);
        }
        renderScanHistory();
    }

    function saveHistory() {
        localStorage.setItem('alvetakBarcodeScanHistory', JSON.stringify(scanHistory)); // Key name updated
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
                    <strong>Ham Barkod Verisi:</strong>
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
    function processBarcodeData(rawData) { // Renamed function
        const timestamp = new Date();
        // Barkod Tara Paneli için
        scanPaneRawData.textContent = rawData;

        const delimiter = currentSettings.delimiter || ','; // Fallback delimiter
        const formula = currentSettings.formula;

        if (!formula) {
            const noFormulaMsg = "Yok (Ayarlarda formül tanımlanmamış)";
            scanPaneCalcResult.textContent = noFormulaMsg;
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
                // Handle comma as decimal separator for Turkish locale
                const numValue = parseFloat(part.replace(',', '.'));
                argValues.push(isNaN(numValue) ? part : numValue); 
            }
        });
        const finalParsedDataDisplay = parsedDataDisplay || "Veri parçaları bulunamadı veya ayırıcı sorunu.";

        if (argValues.length === 0) {
            const noDataMsg = "Hesaplanacak veri yok.";
            scanPaneCalcResult.textContent = noDataMsg;
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

        scanPaneCalcResult.textContent = calculationResultText;
        addScanToHistory({ timestamp: timestamp.toISOString(), rawData, parsedDataDisplay: finalParsedDataDisplay, calculationResultText });
    }

    // --- Initialization ---
    loadSettings();
    loadHistory(); // Load history on startup
    setActivePane('scan-pane'); // Start with scan pane (ID updated)
    // Consider not auto-starting scan to save battery, let user click "Start Scan"
});
