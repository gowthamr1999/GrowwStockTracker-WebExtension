// Content script that runs on Groww pages
(function() {
  'use strict';

  // Function to extract stock data from the current page
  function extractStockData() {
    // Try to find stock name and price on Groww's stock detail page
    const stockNameElement = document.querySelector('[data-auto="stock-name"]') || 
                            document.querySelector('h1.contentPrimary') ||
                            document.querySelector('.stockName');
    
    const priceElement = document.querySelector('[data-auto="current-price"]') ||
                        document.querySelector('.cur86v0') ||
                        document.querySelector('.ltp');
    
    const changeElement = document.querySelector('[data-auto="stock-change"]') ||
                         document.querySelector('.change');

    if (!stockNameElement || !priceElement) {
      return null;
    }

    const stockName = stockNameElement.textContent.trim();
    const priceText = priceElement.textContent.trim();
    const price = parseFloat(priceText.replace(/[₹,]/g, ''));

    let changePercent = null;
    if (changeElement) {
      const changeText = changeElement.textContent.trim();
      const match = changeText.match(/([-+]?\d+\.?\d*)/);
      if (match) {
        changePercent = parseFloat(match[1]);
      }
    }

    // Extract stock symbol from URL
    const urlMatch = window.location.pathname.match(/\/stocks\/([^\/]+)/);
    const symbol = urlMatch ? urlMatch[1] : stockName;

    return {
      symbol,
      name: stockName,
      price,
      changePercent,
      url: window.location.href,
      timestamp: Date.now()
    };
  }

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

      // Save to Chrome storage
      chrome.storage.local.get(['trackedStocks'], (result) => {
        const tracked = result.trackedStocks || {};
        tracked[data.symbol] = data;
        
        chrome.storage.local.set({ trackedStocks: tracked }, () => {
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
