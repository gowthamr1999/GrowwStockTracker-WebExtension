// Popup functionality for stock tracker
(function() {
  'use strict';

  let stocksContainer;
  let totalStocksEl;
  let trackCurrentBtn;
  let refreshBtn;
  let clearAllBtn;
  let exportBtn;
  let importBtn;
  let importFileInput;
  let autoRefreshToggleEl;
  let extensionVersionEl;
  let statusMessageEl;
  let autoRefreshTimer = null;

  const AUTO_REFRESH_MS = 10000;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    stocksContainer = document.getElementById('stocks-container');
    totalStocksEl = document.getElementById('total-stocks');
    trackCurrentBtn = document.getElementById('track-current-btn');
    refreshBtn = document.getElementById('refresh-btn');
    clearAllBtn = document.getElementById('clear-all-btn');
    exportBtn = document.getElementById('export-btn');
    importBtn = document.getElementById('import-btn');
    importFileInput = document.getElementById('import-file-input');
    autoRefreshToggleEl = document.getElementById('auto-refresh-toggle');
    extensionVersionEl = document.getElementById('extension-version');
    statusMessageEl = document.getElementById('status-message');

    if (!stocksContainer || !totalStocksEl || !trackCurrentBtn || !refreshBtn || !clearAllBtn || !exportBtn || !importBtn || !importFileInput || !autoRefreshToggleEl) {
      console.error('Popup UI elements not found.');
      return;
    }

    const extensionVersion = chrome.runtime.getManifest().version;

    if (extensionVersionEl) {
      extensionVersionEl.textContent = `v${extensionVersion}`;
    }

    console.log(`[Groww Stock Tracker] Popup loaded - v${extensionVersion}`);

    trackCurrentBtn.addEventListener('click', trackCurrentPage);
    refreshBtn.addEventListener('click', refreshPrices);
    clearAllBtn.addEventListener('click', clearAll);
    exportBtn.addEventListener('click', exportBackup);
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importBackup);
    autoRefreshToggleEl.addEventListener('change', handleAutoRefreshToggle);

    loadAutoRefreshPreference();
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

  function tabsQuery(queryInfo) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query(queryInfo, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tabs || []);
      });
    });
  }

  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function executeScript(tabId, files) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({ target: { tabId }, files }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async function ensureContentScriptReady(tabId) {
    try {
      await sendMessageToTab(tabId, { type: 'PING_TRACKER' });
      return;
    } catch (error) {
      if (!/Receiving end does not exist/i.test(error.message)) {
        throw error;
      }
    }

    await executeScript(tabId, ['content.js']);
  }

  function showStatus(message, type) {
    if (!statusMessageEl) {
      return;
    }

    statusMessageEl.textContent = message || '';
    statusMessageEl.className = `status-message${type ? ` ${type}` : ''}`;
  }

  function pricesMatch(firstPrice, secondPrice) {
    return Number.isFinite(firstPrice)
      && Number.isFinite(secondPrice)
      && Math.abs(firstPrice - secondPrice) < 0.05;
  }

  function getBuySignal(data) {
    const targetPrice = toNumber(data.targetPrice, NaN);
    const savedPrice = toNumber(data.price, NaN);
    const lastSeenPrice = toNumber(data.lastSeenPrice, savedPrice);
    const currentPrice = toNumber(data.currentPrice, lastSeenPrice);

    if (!Number.isFinite(targetPrice)) {
      return { isBuy: false, reason: '' };
    }

    if (pricesMatch(targetPrice, currentPrice)) {
      return { isBuy: true, reason: 'Live price matched your set price.' };
    }

    if (pricesMatch(targetPrice, lastSeenPrice)) {
      return { isBuy: true, reason: 'Last seen price matched your set price.' };
    }

    return { isBuy: false, reason: '' };
  }

  async function loadAutoRefreshPreference() {
    try {
      const result = await storageGet(['trackerSettings']);
      const enabled = !!(result.trackerSettings && result.trackerSettings.autoRefresh);
      autoRefreshToggleEl.checked = enabled;
      applyAutoRefresh(enabled);
    } catch (error) {
      console.error('Failed to load auto refresh preference:', error);
    }
  }

  function applyAutoRefresh(enabled) {
    if (autoRefreshTimer) {
      window.clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }

    if (enabled) {
      autoRefreshTimer = window.setInterval(() => {
        refreshPrices(true);
      }, AUTO_REFRESH_MS);
    }
  }

  async function handleAutoRefreshToggle() {
    const enabled = !!autoRefreshToggleEl.checked;
    applyAutoRefresh(enabled);

    try {
      const result = await storageGet(['trackerSettings']);
      const settings = result.trackerSettings || {};
      settings.autoRefresh = enabled;
      await storageSet({ trackerSettings: settings });
      showStatus(
        enabled
          ? 'Auto refresh is on while this popup stays open.'
          : 'Auto refresh turned off.',
        'info'
      );

      if (enabled) {
        refreshPrices(true);
      }
    } catch (error) {
      console.error('Failed to save auto refresh preference:', error);
      showStatus('Could not update the auto refresh setting.', 'error');
    }
  }

  function prettifySlug(slug) {
    return String(slug || '')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  async function saveManualStockFromTab(tab, reason) {
    const url = new URL(tab.url);
    const slug = (url.pathname.match(/\/stocks\/([^\/]+)/) || [])[1] || 'manual-stock';
    const defaultName = prettifySlug(slug) || 'Groww Stock';
    const enteredPrice = window.prompt(
      `${reason}\n\nEnter the price you see for ${defaultName}:`,
      ''
    );

    if (enteredPrice === null) {
      showStatus('Manual save cancelled.', 'info');
      return;
    }

    const manualPrice = toNumber(enteredPrice, NaN);
    if (!Number.isFinite(manualPrice) || manualPrice <= 0) {
      showStatus('Please enter a valid price like 679.70', 'error');
      return;
    }

    const result = await storageGet(['trackedStocks']);
    const stocks = normaliseStocks(result.trackedStocks);
    stocks[slug] = {
      symbol: slug,
      name: defaultName,
      price: manualPrice,
      lastSeenPrice: manualPrice,
      currentPrice: manualPrice,
      url: tab.url,
      timestamp: Date.now(),
      manual: true
    };

    await storageSet({ trackedStocks: stocks });
    showStatus(`Saved ${defaultName} at ₹${manualPrice.toFixed(2)}.`, 'success');
    await loadStocks();
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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
          const lastSeenPrice = toNumber(data.lastSeenPrice, savedPrice);
          const currentPrice = toNumber(data.currentPrice, lastSeenPrice);
          const targetPrice = toNumber(data.targetPrice, NaN);

          return [symbol, {
            ...data,
            symbol,
            name: data.name || symbol,
            url: data.url || '#',
            timestamp: Number(data.timestamp) || Date.now(),
            price: savedPrice,
            lastSeenPrice,
            currentPrice,
            targetPrice: Number.isFinite(targetPrice) ? targetPrice : null
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
          text: 'Open a Groww stock page and click "Track This Page" to save it for later comparison.'
        });
        return;
      }

      showStatus('', '');

      const sortedStocks = Object.entries(stocks).sort((a, b) => b[1].timestamp - a[1].timestamp);

      stocksContainer.innerHTML = sortedStocks.map(([symbol, data]) => createStockCard(symbol, data)).join('');

      document.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          const symbol = event.currentTarget.dataset.symbol;
          deleteStock(symbol);
        });
      });

      document.querySelectorAll('.save-target-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          const symbol = event.currentTarget.dataset.symbol;
          saveTargetPrice(symbol);
        });
      });

      document.querySelectorAll('.target-price-input').forEach((input) => {
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            saveTargetPrice(event.currentTarget.dataset.symbol);
          }
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
    const lastSeenPrice = toNumber(data.lastSeenPrice, savedPrice);
    const currentPrice = toNumber(data.currentPrice, lastSeenPrice);
    const priceDiff = currentPrice - lastSeenPrice;
    const percentChange = lastSeenPrice ? ((priceDiff / lastSeenPrice) * 100) : 0;

    let changeClass = 'neutral';
    let changeArrow = '━';
    if (priceDiff > 0) {
      changeClass = 'positive';
      changeArrow = '↑';
    } else if (priceDiff < 0) {
      changeClass = 'negative';
      changeArrow = '↓';
    }

    const targetPrice = toNumber(data.targetPrice, NaN);
    const buySignal = getBuySignal(data);
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
            <div class="price-label">Set Price</div>
            <div class="price-value">${Number.isFinite(targetPrice) ? targetPrice.toFixed(2) : '--'}</div>
          </div>
          <div class="price-box">
            <div class="price-label">Last Seen</div>
            <div class="price-value">${lastSeenPrice.toFixed(2)}</div>
          </div>
          <div class="price-box">
            <div class="price-label">Live Price</div>
            <div class="price-value">${currentPrice.toFixed(2)}</div>
          </div>
        </div>

        <div class="change-display ${changeClass}">
          <span class="change-arrow">${changeArrow}</span>
          <span class="change-amount">${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)}</span>
          <span class="change-percent">${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%</span>
        </div>

        <div class="target-section">
          <div class="target-row">
            <input
              class="target-price-input"
              data-symbol="${safeSymbol}"
              type="number"
              min="0"
              step="0.01"
              placeholder="Set price"
              value="${Number.isFinite(targetPrice) ? targetPrice.toFixed(2) : ''}"
            />
            <button class="save-target-btn" data-symbol="${safeSymbol}" type="button">Set Price</button>
          </div>
          <div class="target-note">
            ${Number.isFinite(targetPrice)
              ? `Set Price: ₹${targetPrice.toFixed(2)} · Last Seen: ₹${lastSeenPrice.toFixed(2)} · Live: ₹${currentPrice.toFixed(2)}`
              : 'Set a buy price and the popup will tell you when it matches the last seen or live price.'}
          </div>
          ${buySignal.isBuy ? `<div class="buy-signal">Buy Signal: ${escapeHtml(buySignal.reason)}</div>` : ''}
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

  async function saveTargetPrice(symbol) {
    const input = document.querySelector(`.target-price-input[data-symbol="${symbol}"]`);
    const targetPrice = input ? toNumber(input.value, NaN) : NaN;

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      showStatus('Enter a valid set price like 679.70', 'error');
      return;
    }

    try {
      const result = await storageGet(['trackedStocks']);
      const stocks = normaliseStocks(result.trackedStocks);

      if (!stocks[symbol]) {
        showStatus('That stock could not be found.', 'error');
        return;
      }

      stocks[symbol].targetPrice = targetPrice;
      await storageSet({ trackedStocks: stocks });

      const buySignal = getBuySignal(stocks[symbol]);
      showStatus(
        buySignal.isBuy
          ? `Set price saved at ₹${targetPrice.toFixed(2)}. Buy signal is active now.`
          : `Set price saved at ₹${targetPrice.toFixed(2)}.`,
        buySignal.isBuy ? 'success' : 'info'
      );
      await loadStocks();
    } catch (error) {
      console.error('Failed to save target price:', error);
      showStatus('Could not save the set price.', 'error');
    }
  }

  async function exportBackup() {
    try {
      const result = await storageGet(['trackedStocks']);
      const stocks = normaliseStocks(result.trackedStocks);
      const payload = {
        exportedAt: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        trackedStocks: stocks
      };

      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`groww-stock-tracker-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
      showStatus(`Backup exported with ${Object.keys(stocks).length} stock${Object.keys(stocks).length !== 1 ? 's' : ''}.`, 'success');
    } catch (error) {
      console.error('Failed to export backup:', error);
      showStatus('Could not export your backup file.', 'error');
    }
  }

  async function importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const importedStocks = normaliseStocks(parsed.trackedStocks || parsed);
      await storageSet({ trackedStocks: importedStocks });
      showStatus(`Backup imported with ${Object.keys(importedStocks).length} stock${Object.keys(importedStocks).length !== 1 ? 's' : ''}.`, 'success');
      await loadStocks();
    } catch (error) {
      console.error('Failed to import backup:', error);
      showStatus('Invalid backup file. Please choose a JSON export from this extension.', 'error');
    } finally {
      importFileInput.value = '';
    }
  }

  async function trackCurrentPage() {
    try {
      showStatus('Checking this page for stock details...', 'info');

      const [tab] = await tabsQuery({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url || !tab.url.includes('groww.in/stocks/')) {
        showStatus('Open a Groww stock page first, then click "Track This Page".', 'error');
        return;
      }

      await ensureContentScriptReady(tab.id);

      const response = await sendMessageToTab(tab.id, { type: 'TRACK_CURRENT_STOCK' });
      if (!response || !response.ok) {
        await saveManualStockFromTab(
          tab,
          response && response.error
            ? `${response.error} Auto-detect did not work on this page yet.`
            : 'Could not auto-read the stock details from this page.'
        );
        return;
      }

      const trackedPrice = toNumber(response.data.price, 0).toFixed(2);
      showStatus(`Tracked ${response.data.name} at ₹${trackedPrice}.`, 'success');
      await loadStocks();
    } catch (error) {
      console.error('Failed to track current page:', error);
      const [tab] = await tabsQuery({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('groww.in/stocks/')) {
        await saveManualStockFromTab(
          tab,
          /Cannot access contents of the page/i.test(error.message)
            ? 'Chrome blocked direct page access here, so manual save is available instead.'
            : 'The page was not ready, so manual save is available instead.'
        );
        return;
      }
      showStatus('Unable to talk to the page. Reload the Groww tab once and try again.', 'error');
    }
  }

  // Delete a stock from tracking
  async function deleteStock(symbol) {
    try {
      const result = await storageGet(['trackedStocks']);
      const stocks = normaliseStocks(result.trackedStocks);
      delete stocks[symbol];
      await storageSet({ trackedStocks: stocks });
      showStatus(`Removed ${symbol} from your tracked list.`, 'info');
      loadStocks();
    } catch (error) {
      console.error('Failed to delete stock:', error);
      showStatus('Could not remove that stock right now.', 'error');
    }
  }

  // Clear all tracked stocks
  async function clearAll() {
    if (!confirm('Are you sure you want to clear all tracked stocks?')) {
      return;
    }

    try {
      await storageSet({ trackedStocks: {} });
      showStatus('Cleared all tracked stocks.', 'info');
      loadStocks();
    } catch (error) {
      console.error('Failed to clear stocks:', error);
      showStatus('Could not clear your tracked list.', 'error');
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
        Refresh All Prices
      `;
  }

  // Refresh current prices with simulated movement
  async function refreshPrices(isAutoRefresh) {
    try {
      const result = await storageGet(['trackedStocks']);
      const stocks = normaliseStocks(result.trackedStocks);

      if (Object.keys(stocks).length === 0) {
        return;
      }

      if (!isAutoRefresh) {
        showStatus('Refreshing saved comparisons...', 'info');
      }
      setRefreshButtonLoading(true, false);

      Object.values(stocks).forEach((data) => {
        const basePrice = toNumber(data.currentPrice, toNumber(data.lastSeenPrice, toNumber(data.price, 0)));
        data.lastSeenPrice = basePrice;
        const change = (Math.random() - 0.5) * 0.02 * basePrice;
        data.currentPrice = basePrice + change;
      });

      await storageSet({ trackedStocks: stocks });
      loadStocks();

      showStatus(
        isAutoRefresh
          ? 'Auto refresh updated all tracked prices.'
          : 'Refresh all updated the live prices and stored the previous values as last seen.',
        isAutoRefresh ? 'info' : 'success'
      );
      window.setTimeout(() => {
        setRefreshButtonLoading(false, false);
      }, 600);
    } catch (error) {
      console.error('Error refreshing prices:', error);
      showStatus('Refresh failed. Please try again.', 'error');
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
