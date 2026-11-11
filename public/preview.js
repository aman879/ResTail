(() => {
  const loader = document.getElementById('preview-loader');
  const iframe = document.getElementById('pdf-frame');
  const titleEl = document.getElementById('resume-title');
  const btnClose = document.getElementById('btn-close');
  const btnDownload = document.getElementById('btn-download');

  let currentBlob = null;
  let currentResumeName = 'Tailored_Resume';
  // The PDF is always shown; the download is the format the user picked (.pdf or .tex).
  let downloadBlob = null;
  let downloadExt = 'pdf';

  // 1. Fetch PDF data from chrome.storage.local
  chrome.storage.local.get(['tempPdfBase64', 'tempResumeName', 'tempOutputFormat', 'tempLatex'], (data) => {
    if (!data.tempPdfBase64) {
      loader.innerHTML = '<div>Error: No preview data found. Please try tailoring again.</div>';
      return;
    }

    currentResumeName = data.tempResumeName || 'Tailored_Resume';
    if (data.tempOutputFormat === 'tex' && data.tempLatex) {
      downloadExt = 'tex';
      downloadBlob = new Blob([data.tempLatex], { type: 'application/x-tex' });
      btnDownload.lastChild.textContent = ' Download .tex';
    }
    titleEl.textContent = `${currentResumeName}.${downloadExt}`;

    // Convert base64 back to Blob
    try {
      const binaryString = atob(data.tempPdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      currentBlob = new Blob([bytes], { type: 'application/pdf' });
      if (!downloadBlob) downloadBlob = currentBlob;
      const blobUrl = URL.createObjectURL(currentBlob);

      // Hide loader and show iframe
      loader.style.display = 'none';
      iframe.src = blobUrl;
      iframe.style.display = 'block';

      // Clear storage to free up memory immediately after loading
      chrome.storage.local.remove(['tempPdfBase64', 'tempLatex', 'tempOutputFormat']);
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
    if (!downloadBlob) return;
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentResumeName}.${downloadExt}`;
    a.click();
    URL.revokeObjectURL(url);
  });
})();
