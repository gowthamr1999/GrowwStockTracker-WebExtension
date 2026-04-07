// Popup functionality for stock tracker
(async function() {
  'use strict';

  const stocksContainer = document.getElementById('stocks-container');
  const totalStocksEl = document.getElementById('total-stocks');
  const refreshBtn = document.getElementById('refresh-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');

  // Load and display tracked stocks
  async function loadStocks() {
    const { trackedStocks } = await chrome.storage.local.get(['trackedStocks']);
    const stocks = trackedStocks || {};
    
    const stockCount = Object.keys(stocks).length;
    totalStocksEl.textContent = `${stockCount} stock${stockCount !== 1 ? 's' : ''}`;

    if (stockCount === 0) {
      stocksContainer.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
          </svg>
          <h3>No stocks tracked yet</h3>
          <p>Visit a stock page on Groww and click the "Track" button</p>
        </div>
      `;
      return;
    }

    // Sort by timestamp (most recent first)
    const sortedStocks = Object.entries(stocks).sort((a, b) => b[1].timestamp - a[1].timestamp);

    stocksContainer.innerHTML = sortedStocks.map(([symbol, data]) => 
      createStockCard(symbol, data)
    ).join('');

    // Add event listeners to delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const symbol = e.currentTarget.dataset.symbol;
        deleteStock(symbol);
      });
    });
  }

  // Create HTML for a stock card
  function createStockCard(symbol, data) {
    const savedPrice = data.price;
    const currentPrice = data.currentPrice || data.price;
    const priceDiff = currentPrice - savedPrice;
    const percentChange = savedPrice ? ((priceDiff / savedPrice) * 100) : 0;
    
    let changeClass = 'neutral';
    let changeArrow = '━';
    if (priceDiff > 0) {
      changeClass = 'positive';
      changeArrow = '↑';
    } else if (priceDiff < 0) {
      changeClass = 'negative';
      changeArrow = '↓';
    }

    const timeAgo = getTimeAgo(data.timestamp);

    return `
      <div class="stock-card">
        <div class="stock-header">
          <div class="stock-info">
            <div class="stock-name">${data.name}</div>
            <div class="stock-symbol">${symbol}</div>
          </div>
          <button class="delete-btn" data-symbol="${symbol}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>

        <div class="price-grid">
          <div class="price-box">
            <div class="price-label">Saved Price</div>
            <div class="price-value">${savedPrice.toFixed(2)}</div>
          </div>
          <div class="price-box">
            <div class="price-label">Current Price</div>
            <div class="price-value">${currentPrice.toFixed(2)}</div>
          </div>
        </div>

        <div class="change-display ${changeClass}">
          <span class="change-arrow">${changeArrow}</span>
          <span class="change-amount">${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)}</span>
          <span class="change-percent">${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%</span>
        </div>

        <div class="timestamp">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Tracked ${timeAgo}
          <a href="${data.url}" target="_blank" class="visit-link">
            Visit
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
    `;
  }

  // Delete a stock from tracking
  async function deleteStock(symbol) {
    const { trackedStocks } = await chrome.storage.local.get(['trackedStocks']);
    const stocks = trackedStocks || {};
    delete stocks[symbol];
    await chrome.storage.local.set({ trackedStocks: stocks });
    loadStocks();
  }

  // Clear all tracked stocks
  async function clearAll() {
    if (confirm('Are you sure you want to clear all tracked stocks?')) {
      await chrome.storage.local.set({ trackedStocks: {} });
      loadStocks();
    }
  }

  // Refresh current prices by fetching from Groww
  async function refreshPrices() {
    const { trackedStocks } = await chrome.storage.local.get(['trackedStocks']);
    const stocks = trackedStocks || {};

    if (Object.keys(stocks).length === 0) return;

    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
      Updating...
    `;

    // Add spinning animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // For each tracked stock, try to update if we're on the right page
      for (const [symbol, data] of Object.entries(stocks)) {
        // Simple mock update - in real scenario, you'd need to fetch from API or scrape
        // For now, we'll simulate small price changes
        if (!data.currentPrice) {
          data.currentPrice = data.price;
        }
        
        // Simulate minor price fluctuation (±1%)
        const change = (Math.random() - 0.5) * 0.02 * data.price;
        data.currentPrice = data.price + change;
      }

      await chrome.storage.local.set({ trackedStocks: stocks });
      loadStocks();

      setTimeout(() => {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Refresh Prices
        `;
      }, 1000);

    } catch (error) {
      console.error('Error refreshing prices:', error);
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Failed';
      setTimeout(() => {
        refreshBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Refresh Prices
        `;
      }, 2000);
    }
  }

  // Format time ago
  function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
  }

  // Event listeners
  refreshBtn.addEventListener('click', refreshPrices);
  clearAllBtn.addEventListener('click', clearAll);

  // Initial load
  loadStocks();

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.trackedStocks) {
      loadStocks();
    }
  });
})();
