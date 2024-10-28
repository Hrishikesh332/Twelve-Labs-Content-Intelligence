document.addEventListener('DOMContentLoaded', function() {
    // State management
    let currentVideoId = null;
    const progressModal = document.getElementById('progressModal');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');

    // ===============================
    // Utility Functions
    // ===============================
    function showMessage(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        
        const container = document.querySelector('.container');
        container.insertBefore(alertDiv, container.firstChild);
        
        setTimeout(() => alertDiv.remove(), 5000);
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showProgress() {
        if (progressModal) {
            progressModal.classList.remove('hidden');
            updateProgress(0);
        }
    }

    function hideProgress() {
        if (progressModal) {
            progressModal.classList.add('hidden');
        }
    }

    function updateProgress(percent) {
        if (progressFill && progressText) {
            progressFill.style.width = `${percent}%`;
            progressText.textContent = `Processing... ${percent}%`;
        }
    }

    // ===============================
    // Category Selection & Analysis
    // ===============================
    const analyzeMainBtn = document.querySelector('.analyze-btn');
    const categoryBtns = document.querySelectorAll('.category-btn');

    // Set up category selection
    if (categoryBtns.length > 0) {
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                this.classList.toggle('selected');
                updateAnalyzeButtonState();
            });
        });
    }

    // Set up analyze button
    if (analyzeMainBtn) {
        analyzeMainBtn.addEventListener('click', handleMainAnalysis);
    }

    function updateAnalyzeButtonState() {
        if (analyzeMainBtn) {
            const selectedCategories = document.querySelectorAll('.category-btn.selected');
            analyzeMainBtn.disabled = selectedCategories.length === 0;
        }
    }

    async function handleMainAnalysis(e) {
        e.preventDefault();
        const selectedCategories = Array.from(document.querySelectorAll('.category-btn.selected'))
            .map(btn => ({
                name: btn.querySelector('.category-label').textContent.trim()
            }));

        if (selectedCategories.length === 0) {
            showMessage('Please select at least one category for analysis', 'error');
            return;
        }

        const btnText = analyzeMainBtn.querySelector('.btn-text');
        const spinner = analyzeMainBtn.querySelector('.spinner');

        try {
            // Update UI state
            analyzeMainBtn.disabled = true;
            btnText.hidden = true;
            spinner.hidden = false;
            showProgress();

            // Send analysis request
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    classes: selectedCategories
                })
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Analysis failed');
            }

            // Display results
            const resultsCard = document.getElementById('resultsCard');
            const resultsContent = document.getElementById('resultsContent');
            
            if (resultsContent) {
                resultsContent.innerHTML = '';
                displayResults(result.results);
                resultsCard.classList.remove('hidden');
                resultsCard.scrollIntoView({ behavior: 'smooth' });
            }

        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            // Reset UI state
            analyzeMainBtn.disabled = false;
            btnText.hidden = false;
            spinner.hidden = true;
            hideProgress();
        }
    }

    // ===============================
    // File Upload Handling
    // ===============================
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('videoFile');
    const uploadBtn = document.getElementById('uploadBtn');

    if (dropZone && fileInput) {
        // Set up drag and drop events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults);
            document.body.addEventListener(eventName, preventDefaults);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight);
        });

        // Set up file handling
        dropZone.addEventListener('drop', handleDrop);
        fileInput.addEventListener('change', handleFileSelect);
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropZone.classList.add('drag-active');
    }

    function unhighlight() {
        dropZone.classList.remove('drag-active');
    }

    function isValidVideoFile(file) {
        const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
        return validTypes.includes(file.type);
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }

    function handleFile(file) {
        if (!file) return;

        if (isValidVideoFile(file)) {
            const fileInfo = document.getElementById('fileInfo');
            if (fileInfo) {
                fileInfo.innerHTML = `
                    <div class="file-preview">
                        <div class="file-icon">🎥</div>
                        <div class="file-details">
                            <div class="file-name">${file.name}</div>
                            <div class="file-size">${formatFileSize(file.size)}</div>
                        </div>
                        <button type="button" class="remove-file">×</button>
                    </div>
                `;

                if (uploadBtn) {
                    uploadBtn.disabled = false;
                }

                // Add remove file functionality
                const removeBtn = fileInfo.querySelector('.remove-file');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        if (fileInput) fileInput.value = '';
                        fileInfo.innerHTML = '';
                        if (uploadBtn) uploadBtn.disabled = true;
                    });
                }
            }
        } else {
            showMessage('Please select a valid video file (MP4, MOV, or AVI)', 'error');
            if (uploadBtn) uploadBtn.disabled = true;
        }
    }

    // ===============================
    // Results Display
    // ===============================
    function displayResults(results) {
        const resultsContent = document.getElementById('resultsContent');
        if (!resultsContent) return;

        results.forEach(result => {
            const resultElement = document.createElement('div');
            resultElement.className = 'result-item';

            // Create video player if URL exists
            if (result.video_url) {
                const videoId = `video-${result.video_id}`;
                resultElement.innerHTML += `
                    <div class="video-player" id="${videoId}">
                        <video controls>
                            <source src="${result.video_url}" type="application/x-mpegURL">
                            Your browser does not support HLS video playback.
                        </video>
                    </div>
                `;
                initializeVideoPlayer(videoId, result.video_url);
            }

            // Display analysis results
            result.classes.forEach(classResult => {
                const percentage = (classResult.score * 100).toFixed(1);
                resultElement.innerHTML += `
                    <div class="analysis-result">
                        <div class="result-header">
                            <span class="result-name">${classResult.name}</span>
                            <span class="result-score">${percentage}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
            });

            resultsContent.appendChild(resultElement);
        });
    }

    function initializeVideoPlayer(videoId, videoUrl) {
        const video = document.querySelector(`#${videoId} video`);
        if (!video) return;

        if (window.Hls && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play().catch(e => console.log('Auto-play prevented:', e));
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl;
            video.addEventListener('loadedmetadata', function() {
                video.play().catch(e => console.log('Auto-play prevented:', e));
            });
        }
    }

    // Initialize tab switching if on upload page
    const uploadTabs = document.querySelectorAll('.upload-tabs button');
    const tabContents = document.querySelectorAll('.tab-content');

    if (uploadTabs.length > 0) {
        uploadTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                uploadTabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(c => c.classList.add('hidden'));

                // Add active class to clicked tab and show corresponding content
                tab.classList.add('active');
                const contentId = tab.getAttribute('data-tab');
                document.getElementById(contentId)?.classList.remove('hidden');
            });
        });
    }
});