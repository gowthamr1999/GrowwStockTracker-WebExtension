// Popup functionality for stock tracker
(function() {
  'use strict';

  let stocksContainer;
  let totalStocksEl;
  let refreshBtn;
  let clearAllBtn;
  let extensionVersionEl;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    stocksContainer = document.getElementById('stocks-container');
    totalStocksEl = document.getElementById('total-stocks');
    refreshBtn = document.getElementById('refresh-btn');
    clearAllBtn = document.getElementById('clear-all-btn');
    extensionVersionEl = document.getElementById('extension-version');

    if (!stocksContainer || !totalStocksEl || !refreshBtn || !clearAllBtn) {
      console.error('Popup UI elements not found.');
      return;
    }

    const extensionVersion = chrome.runtime.getManifest().version;

    if (extensionVersionEl) {
      extensionVersionEl.textContent = `v${extensionVersion}`;
    }

    console.log(`[Groww Stock Tracker] Popup loaded - v${extensionVersion}`);

    refreshBtn.addEventListener('click', refreshPrices);
    clearAllBtn.addEventListener('click', clearAll);

    loadStocks();

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.trackedStocks) {
        loadStocks();
      }
    });
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageSet(value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(value, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function toNumber(value, fallback) {
    const parsed = typeof value === 'number'
      ? value
      : parseFloat(String(value || '').replace(/[₹,]/g, ''));

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function renderEmptyState(message) {
    stocksContainer.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <polyline points="19 12 12 19 5 12"/>
        </svg>
        <h3>${message.title}</h3>
        <p>${message.text}</p>
      </div>
    `;
  }

  function normaliseStocks(rawStocks) {
    const stocks = rawStocks && typeof rawStocks === 'object' ? rawStocks : {};

    return Object.fromEntries(
      Object.entries(stocks)
        .filter(([, data]) => data && typeof data === 'object')
        .map(([symbol, data]) => {
          const savedPrice = toNumber(data.price, 0);
          const currentPrice = toNumber(data.currentPrice, savedPrice);

          return [symbol, {
            ...data,
            symbol,
            name: data.name || symbol,
            url: data.url || '#',
            timestamp: Number(data.timestamp) || Date.now(),
            price: savedPrice,
            currentPrice
          }];
        })
    );
  }

  // Load and display tracked stocks
  async function loadStocks() {
    try {
      const result = await storageGet(['trackedStocks']);
      const stocks = normaliseStocks(result.trackedStocks);
      const stockCount = Object.keys(stocks).length;

      totalStocksEl.textContent = `${stockCount} stock${stockCount !== 1 ? 's' : ''}`;

      if (stockCount === 0) {
        renderEmptyState({
          title: 'No stocks tracked yet',
          text: 'Visit a stock page on Groww and click the "Track" button'
        });
        return;
      }

      const sortedStocks = Object.entries(stocks).sort((a, b) => b[1].timestamp - a[1].timestamp);

      stocksContainer.innerHTML = sortedStocks.map(([symbol, data]) => createStockCard(symbol, data)).join('');

      document.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          const symbol = event.currentTarget.dataset.symbol;
          deleteStock(symbol);
        });
      });
    } catch (error) {
      console.error('Failed to load stocks:', error);
      totalStocksEl.textContent = 'Unavailable';
      renderEmptyState({
        title: 'Could not load popup',
        text: 'Reload the extension in chrome://extensions/ and try again.'
      });
    }
  }

  // Create HTML for a stock card
  function createStockCard(symbol, data) {
    const savedPrice = toNumber(data.price, 0);
    const currentPrice = toNumber(data.currentPrice, savedPrice);
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

    const safeName = escapeHtml(data.name || symbol);
    const safeSymbol = escapeHtml(symbol);
    const safeUrl = data.url && data.url !== '#'
      ? `<a href="${escapeHtml(data.url)}" target="_blank" class="visit-link">\n            Visit\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\n              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>\n              <polyline points="15 3 21 3 21 9"/>\n              <line x1="10" y1="14" x2="21" y2="3"/>\n            </svg>\n          </a>`
      : '';

    return `
      <div class="stock-card">
        <div class="stock-header">
          <div class="stock-info">
            <div class="stock-name">${safeName}</div>
            <div class="stock-symbol">${safeSymbol}</div>
          </div>
          <button class="delete-btn" data-symbol="${safeSymbol}" type="button" aria-label="Delete ${safeName}">
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
          Tracked ${getTimeAgo(data.timestamp)}
          ${safeUrl}
        </div>
      </div>
    `;
  }

  // Delete a stock from tracking
  async function deleteStock(symbol) {
    try {
      const result = await storageGet(['trackedStocks']);
      const stocks = normaliseStocks(result.trackedStocks);
      delete stocks[symbol];
      await storageSet({ trackedStocks: stocks });
      loadStocks();
    } catch (error) {
      console.error('Failed to delete stock:', error);
    }
  }

  // Clear all tracked stocks
  async function clearAll() {
    if (!confirm('Are you sure you want to clear all tracked stocks?')) {
      return;
    }

    try {
      await storageSet({ trackedStocks: {} });
      loadStocks();
    } catch (error) {
      console.error('Failed to clear stocks:', error);
    }
  }

  function setRefreshButtonLoading(isLoading, failed) {
    refreshBtn.disabled = isLoading;

    if (isLoading) {
      refreshBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        Updating...
      `;
      return;
    }

    refreshBtn.innerHTML = failed
      ? 'Refresh Failed'
      : `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        Refresh Prices
      `;
  }

  // Refresh current prices with simulated movement
  async function refreshPrices() {
    try {
      const result = await storageGet(['trackedStocks']);
      const stocks = normaliseStocks(result.trackedStocks);

      if (Object.keys(stocks).length === 0) {
        return;
      }

      setRefreshButtonLoading(true, false);

      Object.values(stocks).forEach((data) => {
        const basePrice = toNumber(data.currentPrice, toNumber(data.price, 0));
        const change = (Math.random() - 0.5) * 0.02 * basePrice;
        data.currentPrice = basePrice + change;
      });

      await storageSet({ trackedStocks: stocks });
      loadStocks();

      window.setTimeout(() => {
        setRefreshButtonLoading(false, false);
      }, 600);
    } catch (error) {
      console.error('Error refreshing prices:', error);
      setRefreshButtonLoading(false, true);
      window.setTimeout(() => {
        setRefreshButtonLoading(false, false);
      }, 1500);
    }
  }

  // Format time ago
  function getTimeAgo(timestamp) {
    const safeTimestamp = Number(timestamp) || Date.now();
    const seconds = Math.floor((Date.now() - safeTimestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return new Date(safeTimestamp).toLocaleDateString();
  }
})();
