// Handle OpenAI API key
document.getElementById('save-openai-key').addEventListener('click', function () {
    const openaiKey = document.getElementById('openai-key').value.trim();
    const statusDiv = document.getElementById('openai-status');

    if (!openaiKey) {
        statusDiv.textContent = 'Please enter an API key';
        statusDiv.className = 'ai-status error';
        return;
    }

    // Save the API key
    chrome.storage.local.set({ 'openai_api_key': openaiKey }, function () {
        statusDiv.textContent = 'API key saved!';
        statusDiv.className = 'ai-status success';
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'ai-status';
        }, 3000);
    });
});

// Load saved OpenAI API key
chrome.storage.local.get('openai_api_key', function (result) {
    if (result.openai_api_key) {
        document.getElementById('openai-key').value = result.openai_api_key;
    }
}); 