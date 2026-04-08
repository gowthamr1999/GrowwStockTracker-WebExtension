// Content script that runs on Groww pages
(function() {
  'use strict';

  const extensionVersion = chrome.runtime.getManifest().version;
  console.log(`[Groww Stock Tracker] Content script active - v${extensionVersion}`);

  function parsePriceFromText(text) {
    if (!text) {
      return NaN;
    }

    const match = String(text).match(/₹\s*([\d,]+(?:\.\d+)?)/);
    if (!match) {
      return NaN;
    }

    return parseFloat(match[1].replace(/,/g, ''));
  }

  // Function to extract stock data from the current page
  function extractStockData() {
    const stockNameElement = document.querySelector('[data-auto="stock-name"]') ||
      document.querySelector('h1.contentPrimary') ||
      document.querySelector('.stockName') ||
      document.querySelector('h1');

    const priceElement = document.querySelector('[data-auto="current-price"]') ||
      document.querySelector('[data-testid="instrument-price-lastprice"]') ||
      document.querySelector('[data-testid="ltp"]') ||
      document.querySelector('.cur86v0') ||
      document.querySelector('.ltp') ||
      document.querySelector('[class*="price"]');

    const changeElement = document.querySelector('[data-auto="stock-change"]') ||
      document.querySelector('[data-testid="instrument-price-change"]') ||
      document.querySelector('.change');

    const stockName = stockNameElement
      ? stockNameElement.textContent.trim()
      : document.title.replace(/\s*[|\-].*$/, '').trim();

    const pageText = document.body ? document.body.innerText : '';
    const nearbyText = stockNameElement && stockNameElement.parentElement
      ? stockNameElement.parentElement.innerText
      : pageText;

    const priceText = priceElement ? priceElement.textContent.trim() : '';
    let price = parsePriceFromText(priceText);

    if (!Number.isFinite(price)) {
      price = parsePriceFromText(nearbyText);
    }

    if (!Number.isFinite(price)) {
      price = parsePriceFromText(pageText);
    }

    let changePercent = null;
    if (changeElement) {
      const changeText = changeElement.textContent.trim();
      const match = changeText.match(/([-+]?\d+\.?\d*)/);
      if (match) {
        changePercent = parseFloat(match[1]);
      }
    }

    const urlMatch = window.location.pathname.match(/\/stocks\/([^\/]+)/);
    const symbol = urlMatch ? urlMatch[1] : stockName;

    if (!stockName || !Number.isFinite(price)) {
      console.warn('[Groww Stock Tracker] Could not extract stock details from page.', {
        stockName,
        priceText
      });
      return null;
    }

    return {
      symbol,
      name: stockName,
      price,
      changePercent,
      url: window.location.href,
      timestamp: Date.now()
    };
  }

  function saveTrackedStock(data, callback) {
    chrome.storage.local.get(['trackedStocks'], (result) => {
      const tracked = result.trackedStocks || {};
      const previous = tracked[data.symbol] || {};

      tracked[data.symbol] = {
        ...previous,
        ...data,
        price: data.price,
        lastSeenPrice: Number.isFinite(previous.currentPrice) ? previous.currentPrice : data.price,
        currentPrice: data.price,
        timestamp: Date.now()
      };

      chrome.storage.local.set({ trackedStocks: tracked }, () => {
        if (chrome.runtime.lastError) {
          callback(chrome.runtime.lastError.message);
          return;
        }

        console.log(`[Groww Stock Tracker] Tracked ${data.name} at ₹${data.price}`);
        callback(null, data);
      });
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'TRACK_CURRENT_STOCK') {
      return;
    }

    const data = extractStockData();
    if (!data || !Number.isFinite(data.price)) {
      sendResponse({ ok: false, error: 'Open a Groww stock page with a visible price first.' });
      return;
    }

    saveTrackedStock(data, (error, savedData) => {
      if (error) {
        sendResponse({ ok: false, error });
        return;
      }

      sendResponse({ ok: true, data: savedData });
    });

    return true;
  });

  // Add a floating button to track the current stock
  function addTrackButton() {
    // Remove existing button if any
    const existing = document.getElementById('groww-tracker-btn');
    if (existing) {
      existing.remove();
    }

    const stockData = extractStockData();
    if (!stockData) return;

    const button = document.createElement('button');
    button.id = 'groww-tracker-btn';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
      <span>Track</span>
    `;
    
    button.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 25px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      z-index: 10000;
      transition: all 0.3s ease;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
    });

    button.addEventListener('click', async () => {
      const data = extractStockData();
      if (!data) {
        alert('Could not extract stock data');
        return;
      }

      saveTrackedStock(data, (error) => {
        if (error) {
          alert(`Could not save stock: ${error}`);
          return;
        }

        // Show success feedback
        button.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Tracked!</span>
        `;
        button.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';

        setTimeout(() => {
          button.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Track</span>
          `;
          button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, 2000);
      });
    });

    document.body.appendChild(button);
  }

  // Initialize when page is loaded
  function init() {
    // Check if we're on a stock page
    if (window.location.pathname.includes('/stocks/')) {
      setTimeout(addTrackButton, 1000); // Wait for page to fully load
    }
  }

  // Watch for URL changes (for single-page app navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      init();
    }
  }).observe(document, { subtree: true, childList: true });

  init();
})();
