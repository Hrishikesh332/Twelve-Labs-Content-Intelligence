document.addEventListener('DOMContentLoaded', function() {

    const uploadTrigger = document.getElementById('uploadTrigger');
    const uploadModal = document.getElementById('uploadModal');
    const uploadForm = document.getElementById('uploadForm');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const closeModal = document.getElementById('closeModal');
    const selectedFileDiv = document.getElementById('selectedFile');
    const processingOverlay = document.getElementById('processingOverlay');
    const resultsSection = document.getElementById('resultsSection');

    let currentFile = null;


    uploadTrigger?.addEventListener('click', () => {
        uploadModal.classList.remove('hidden');
    });

    closeModal?.addEventListener('click', () => {
        uploadModal.classList.add('hidden');
        resetForm();
    });

    cancelBtn?.addEventListener('click', () => {
        uploadModal.classList.add('hidden');
        resetForm();
    });


    uploadModal?.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
            uploadModal.classList.add('hidden');
            resetForm();
        }
    });

    dropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone?.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    dropZone?.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput?.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    function handleFiles(files) {
        const file = files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('video/')) {
            showNotification('Please upload a video file', 'error');
            return;
        }

        const maxSize = 2 * 1024 * 1024 * 1024;
        if (file.size > maxSize) {
            showNotification('File size must be less than 2GB', 'error');
            return;
        }

        currentFile = file;
        uploadBtn.disabled = false;
        
        selectedFileDiv.innerHTML = `
            <div class="file-info">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
        `;
        selectedFileDiv.classList.remove('hidden');
    }

    uploadForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentFile) return;

        try {
            setUploadingState(true);
            
            uploadModal.classList.add('hidden');
            showProcessingOverlay();

            const formData = new FormData();
            formData.append('video', currentFile);

            const uploadResponse = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error('Upload failed');
            }

            const uploadResult = await uploadResponse.json();

            if (uploadResult.success) {
                await startAnalysis();
            } else {
                throw new Error(uploadResult.error || 'Upload failed');
            }

        } catch (error) {
            showNotification(error.message, 'error');
            hideProcessingOverlay();
            setUploadingState(false);
        }
    });

    async function startAnalysis() {
        try {
            const analysisResponse = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!analysisResponse.ok) {
                throw new Error('Analysis failed');
            }

            const analysisResult = await analysisResponse.json();

            if (analysisResult.success) {
                displayResults(analysisResult);
                showNotification('Analysis completed successfully', 'success');
            } else {
                throw new Error(analysisResult.error || 'Analysis failed');
            }

        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            hideProcessingOverlay();
            setUploadingState(false);
            resetForm();
        }
    }

    function displayResults(results) {
        resultsSection.classList.remove('hidden');

        const timestamp = new Date(results.timestamp).toLocaleString();
        document.getElementById('reportTimestamp').textContent = `Generated: ${timestamp}`;

        if (results.video_url) {
            const videoPlayer = document.getElementById('videoPlayer');
            videoPlayer.innerHTML = `
                <video controls>
                    <source src="${results.video_url}" type="application/x-mpegURL">
                    Your browser does not support HLS video playback.
                </video>
            `;

            const video = videoPlayer.querySelector('video');
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(results.video_url);
                hls.attachMedia(video);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = results.video_url;
            }
        }

        const violationSummary = document.getElementById('violationSummary');
        const analysisResults = document.getElementById('analysisResults');
        const videoInfo = document.getElementById('videoInfo');
        const analysis = results.analysis;
        
        videoInfo.innerHTML = `
            <div class="video-metadata">
                <div class="info-item">
                    <span class="info-label">Duration:</span>
                    <span class="info-value">${analysis.duration}s</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Risk Level:</span>
                    <span class="info-value risk-${analysis.risk_level}">${analysis.risk_level.toUpperCase()}</span>
                </div>
            </div>
        `;
        violationSummary.innerHTML = `
            <h3>Content Analysis Summary</h3>
            <p>${analysis.summary}</p>
            <div class="violation-stats">
                <div class="stat-item">
                    <span class="stat-value">${analysis.violation_count}</span>
                    <span class="stat-label">Violations Detected</span>
                </div>
                ${Object.entries(analysis.policy_categories)
                    .map(([category, violated]) => `
                        <div class="policy-item ${violated ? 'violated' : ''}">
                            <span class="policy-icon">${violated ? '❌' : '✅'}</span>
                            <span class="policy-name">${formatCategory(category)}</span>
                        </div>
                    `).join('')}
            </div>
        `;

        analysisResults.innerHTML = `
            <h3>Detailed Findings</h3>
            ${analysis.violations.map(violation => `
                <div class="violation-item">
                    <div class="violation-time">
                        ${formatTime(violation.timestamp)}
                    </div>
                    <div class="violation-content">
                        <div class="violation-header">
                            <span class="violation-type">${violation.type}</span>
                            <span class="violation-severity severity-${violation.severity}">
                                ${violation.severity.toUpperCase()}
                            </span>
                        </div>
                        <p class="violation-description">${violation.description}</p>

                    </div>
                </div>
            `).join('')}
            
            ${analysis.recommendations.length > 0 ? `
                <div class="recommendations">
                    <h4>Recommendations</h4>
                    <ul>
                        ${analysis.recommendations.map(rec => `
                            <li>${rec}</li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}
        `;

        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    function formatCategory(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    function setUploadingState(isUploading) {
        const btnText = uploadBtn.querySelector('.btn-text');
        const spinner = uploadBtn.querySelector('.spinner');
        
        if (isUploading) {
            uploadBtn.disabled = true;
            btnText.style.display = 'none';
            spinner.classList.remove('hidden');
        } else {
            uploadBtn.disabled = false;
            btnText.style.display = 'inline';
            spinner.classList.add('hidden');
        }
    }

    function showProcessingOverlay() {
        processingOverlay.classList.remove('hidden');
        if (currentFile) {
            createVideoThumbnail(currentFile);
        }
    }

    function hideProcessingOverlay() {
        processingOverlay.classList.add('hidden');
    }

    function createVideoThumbnail(file) {
        const video = document.createElement('video');
        const thumbnailContainer = document.getElementById('videoThumbnail');
        
        video.src = URL.createObjectURL(file);
        video.addEventListener('loadeddata', () => {
            video.currentTime = 1; // 1 second to avoid black frame
        });

        video.addEventListener('seeked', () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            thumbnailContainer.innerHTML = `
                <img src="${canvas.toDataURL()}" alt="Video thumbnail">
            `;
            
            URL.revokeObjectURL(video.src);
        });
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        notification.innerHTML = `
            <span class="notification-icon">${type === 'error' ? '❌' : '✅'}</span>
            <span class="notification-message">${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    function resetForm() {
        if (uploadForm) uploadForm.reset();
        currentFile = null;
        if (uploadBtn) uploadBtn.disabled = true;
        if (selectedFileDiv) {
            selectedFileDiv.innerHTML = '';
            selectedFileDiv.classList.add('hidden');
        }
        if (dropZone) dropZone.classList.remove('dragover');
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
});