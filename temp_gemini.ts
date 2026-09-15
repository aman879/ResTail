// Content script for Gemini

let selectedChats = new Set<HTMLElement>();

function toggleBatchMode(enabled: boolean) {
  if (enabled) {
    injectCheckboxes();
    showFloatingButton();
  } else {
    removeCheckboxes();
    hideFloatingButton();
  }
}

function getHistoryItems(): HTMLElement[] {
  // Find all a tags that link to chats and have standard material list item classes
  const containers = document.querySelectorAll('a[href*="/app/"][class*="list-item"], a[href*="/chat/"][class*="list-item"]');
  return Array.from(containers) as HTMLElement[];
}

function injectCheckboxes() {
  const items = getHistoryItems();
  
  items.forEach(item => {
    // Check if already injected
    if (item.querySelector('.delete-ai-chat-cb-wrapper')) return;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'delete-ai-chat-cb-wrapper';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.marginRight = '8px';
    wrapper.style.zIndex = '9999';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.width = '18px';
    cb.style.height = '18px';
    cb.style.cursor = 'pointer';
    cb.style.accentColor = '#e11d48'; // Rose-600 (functional accent)
    cb.style.borderRadius = '50%'; // Make it round
    cb.style.appearance = 'none';
    cb.style.border = '2px solid #52525b'; // Zinc-600
    cb.style.outline = 'none';
    
    // Style hack to make it look like a round checkbox when checked
    cb.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.checked) {
        target.style.backgroundColor = '#e11d48'; // Rose-600
        target.style.borderColor = '#e11d48';
        selectedChats.add(item);
      } else {
        target.style.backgroundColor = 'transparent';
        target.style.borderColor = '#52525b'; // Zinc-600
        selectedChats.delete(item);
      }
      updateFloatingButton();
    });

    wrapper.appendChild(cb);
    
    // Insert at the beginning of the item
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.insertBefore(wrapper, item.firstChild);
    
    // Prevent clicking checkbox from navigating
    wrapper.addEventListener('click', (e) => e.stopPropagation());
  });
}

function removeCheckboxes() {
  document.querySelectorAll('.delete-ai-chat-cb-wrapper').forEach(el => el.remove());
  selectedChats.clear();
}

function showFloatingButton() {
  if (document.getElementById('delete-ai-chat-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'delete-ai-chat-btn';
  btn.innerText = 'Delete Selected (0)';
  btn.style.position = 'fixed';
  btn.style.bottom = '24px';
  btn.style.right = '24px';
  btn.style.padding = '12px 24px';
  btn.style.backgroundColor = '#e11d48'; // Rose-600
  btn.style.color = 'white';
  btn.style.border = 'none';
  btn.style.borderRadius = '9999px';
  btn.style.fontWeight = 'bold';
  btn.style.cursor = 'pointer';
  btn.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
  btn.style.zIndex = '10000';
  btn.style.transition = 'all 0.2s';
  btn.style.opacity = '0.5';
  btn.style.pointerEvents = 'none';

  btn.addEventListener('click', () => {
    deleteSelectedChats();
  });

  document.body.appendChild(btn);
}

function hideFloatingButton() {
  const btn = document.getElementById('delete-ai-chat-btn');
  if (btn) btn.remove();
}

function updateFloatingButton() {
  const btn = document.getElementById('delete-ai-chat-btn');
  if (btn) {
    btn.innerText = `Delete Selected (${selectedChats.size})`;
    if (selectedChats.size > 0) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    } else {
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
    }
  }
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function deleteSelectedChats() {
  const btn = document.getElementById('delete-ai-chat-btn');
  if (btn) {
    btn.innerText = 'Deleting...';
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  }

  const chatsArray = Array.from(selectedChats);
  
  for (const item of chatsArray) {
    try {
      // 1. Find and click the 3-dot menu button for this item
      // Usually it's a button inside the item or a sibling, often with aria-haspopup="menu"
      const parent = item.parentElement || item;
      const menuBtn = parent.querySelector('button[aria-haspopup="menu"], button[aria-label*="options" i], button[data-test-id="conversation-menu"]') as HTMLElement;
      
      if (menuBtn) {
        menuBtn.click();
        await sleep(150); // Fast wait for menu to open

        // 2. Find and click the Delete option
        // We look for a menu item containing the text "Delete"
        const menuItems = document.querySelectorAll('menu-item, [role="menuitem"], .mat-mdc-menu-item, button');
        let deleteBtn: HTMLElement | null = null;
        
        for (const mi of Array.from(menuItems)) {
          const text = mi.textContent?.toLowerCase().trim() || '';
          if (text === 'delete' || text.includes('delete')) {
            // Only click if it's in a menu/overlay
            if (mi.closest('.cdk-overlay-container, [role="menu"], mat-menu')) {
              deleteBtn = mi as HTMLElement;
              break;
            }
          }
        }

        if (deleteBtn) {
          deleteBtn.click();
          await sleep(150); // Fast wait for confirmation dialog

          // 3. Find and click Confirm
          const confirmBtns = document.querySelectorAll('button');
          for (const cb of Array.from(confirmBtns)) {
            const cbText = cb.textContent?.toLowerCase().trim() || '';
            if (cbText === 'delete' && cb.closest('dialog, .mat-mdc-dialog-container, [role="dialog"], .cdk-overlay-container')) {
              cb.click();
              break;
            }
          }
          
          await sleep(300); // Wait for deletion to complete before next
        } else {
          console.warn('Delete button not found in menu for item', item);
          // Close menu if delete not found (click anywhere)
          document.body.click();
          await sleep(300);
        }
      }
    } catch (e) {
      console.error('Error deleting chat:', e);
    }
  }

  // Refresh UI
  selectedChats.clear();
  hideFloatingButton();
  removeCheckboxes();
  injectCheckboxes(); // re-inject for remaining
  showFloatingButton();
  updateFloatingButton();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TOGGLE_BATCH_MODE') {
    toggleBatchMode(message.enabled);
    sendResponse({ success: true });
  }
});
