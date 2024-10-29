document.addEventListener('DOMContentLoaded', function() {
    let currentVideoId = null;
    const progressModal = document.getElementById('progressModal');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const analyzeMainBtn = document.querySelector('.analyze-btn');
    const categoryBtns = document.querySelectorAll('.category-btn');

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

    if (categoryBtns.length > 0) {
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                this.classList.toggle('selected');
                updateAnalyzeButtonState();
            });
        });
    }

    function updateAnalyzeButtonState() {
        const selectedCategories = document.querySelectorAll('.category-btn.selected');
        if (analyzeMainBtn) {
            analyzeMainBtn.disabled = selectedCategories.length === 0;
        }
    }


    const analyzeBtn = document.querySelector('.analyze-btn, button:has(.btn-text)');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', handleMainAnalysis);
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

        const btnText = this.querySelector('.btn-text');
        const spinner = this.querySelector('.spinner');

        try {
            this.disabled = true;
            if (btnText) btnText.hidden = true;
            if (spinner) spinner.hidden = false;
            showProgress();

            const response = await fetch('/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    classes: selectedCategories
                })
            });

            if (!response.ok) {
                throw new Error(`No Flag Identified`);
            }

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Analysis failed');
            }


            const resultsCard = document.getElementById('resultsCard');
            const resultsContent = document.getElementById('resultsContent');
            
            if (resultsContent && resultsCard) {
                resultsContent.innerHTML = '';
                displayResults(result.results);
                resultsCard.classList.remove('hidden');
                resultsCard.scrollIntoView({ behavior: 'smooth' });
            }

        } catch (error) {
            console.error('Analysis error:', error);
            showMessage(error.message, 'error');
        } finally {
            // Reset UI state
            this.disabled = false;
            if (btnText) btnText.hidden = false;
            if (spinner) spinner.hidden = true;
            hideProgress();
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
});