(() => {
  const loader = document.getElementById('preview-loader');
  const iframe = document.getElementById('pdf-frame');
  const titleEl = document.getElementById('resume-title');
  const btnClose = document.getElementById('btn-close');
  const btnDownload = document.getElementById('btn-download');

  let currentBlob = null;
  let currentResumeName = 'Tailored_Resume';

  // 1. Fetch PDF data from chrome.storage.local
  chrome.storage.local.get(['tempPdfBase64', 'tempResumeName'], (data) => {
    if (!data.tempPdfBase64) {
      loader.innerHTML = '<div>Error: No preview data found. Please try tailoring again.</div>';
      return;
    }

    currentResumeName = data.tempResumeName || 'Tailored_Resume';
    titleEl.textContent = `${currentResumeName}.pdf`;

    // Convert base64 back to Blob
    try {
      const binaryString = atob(data.tempPdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      currentBlob = new Blob([bytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(currentBlob);

      // Hide loader and show iframe
      loader.style.display = 'none';
      iframe.src = blobUrl;
      iframe.style.display = 'block';

      // Clear storage to free up memory immediately after loading
      chrome.storage.local.remove(['tempPdfBase64']);
    } catch (err) {
      console.error('Error generating PDF blob:', err);
      loader.innerHTML = '<div>Failed to load PDF preview.</div>';
    }
  });

  // Close tab button
  btnClose.addEventListener('click', () => {
    chrome.storage.local.remove(['tempResumeName']);
    window.close();
  });

  // Download button
  btnDownload.addEventListener('click', () => {
    if (!currentBlob) return;
    const url = URL.createObjectURL(currentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentResumeName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  });
})();
