document.addEventListener('DOMContentLoaded', function() {

    const uploadTrigger = document.getElementById('uploadTrigger');
    const uploadModal = document.getElementById('uploadModal');
    const uploadForm = document.getElementById('uploadForm');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const selectedFileDiv = document.getElementById('selectedFile');
    const processingOverlay = document.getElementById('processingOverlay');
    const resultsSection = document.getElementById('resultsSection');

    let currentFile = null;

    uploadTrigger?.addEventListener('click', () => {
        uploadModal.classList.remove('hidden');
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
        

        selectedFileDiv.textContent = file.name;
        selectedFileDiv.classList.remove('hidden');
        
        showNotification('File selected successfully', 'success');
    }

    uploadForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentFile) return;

        try {
            setUploadingState(true);
            
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
                uploadModal.classList.add('hidden');
                showProcessingOverlay();
                await startAnalysis();
            } else {
                throw new Error(uploadResult.error || 'Upload failed');
            }

        } catch (error) {
            showNotification(error.message, 'error');
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


        const videoPlayer = document.getElementById('videoPlayer');
        if (results.video_url) {
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

        const analysisResults = document.getElementById('analysisResults');
        if (results.analysis) {
            analysisResults.innerHTML = `
                <div class="analysis-content">
                    <h3>Content Analysis Results</h3>
                    <div class="analysis-text">${results.analysis}</div>
                </div>
            `;
        }

        resultsSection.scrollIntoView({ behavior: 'smooth' });
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

    function setUploadingState(isUploading) {
        const btnText = uploadBtn.querySelector('.btn-text');
        const spinner = uploadBtn.querySelector('.spinner');
        
        if (isUploading) {
            uploadBtn.disabled = true;
            btnText.style.display = 'none';
            spinner.classList.remove('hidden');
            cancelBtn.disabled = true;
        } else {
            uploadBtn.disabled = true;
            btnText.style.display = 'inline';
            spinner.classList.add('hidden');
            cancelBtn.disabled = false;
        }
    }

    function showProcessingOverlay() {
        processingOverlay.classList.remove('hidden');
    }

    function hideProcessingOverlay() {
        processingOverlay.classList.add('hidden');
    }

    function resetForm() {
        if (uploadForm) uploadForm.reset();
        currentFile = null;
        if (uploadBtn) uploadBtn.disabled = true;
        if (selectedFileDiv) {
            selectedFileDiv.textContent = '';
            selectedFileDiv.classList.add('hidden');
        }
        if (dropZone) dropZone.classList.remove('dragover');
    }

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
});


const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 1rem;
        right: 1rem;
        padding: 1rem;
        border-radius: 0.5rem;
        background: white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 1100;
        animation: slideIn 0.3s ease;
    }

    .notification-success {
        border-left: 4px solid #5AC903;
    }

    .notification-error {
        border-left: 4px solid #dc2626;
    }

    .notification.fade-out {
        animation: slideOut 0.3s ease;
    }

    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;