'use strict';

chrome.runtime.onInstalled.addListener(() => {
  const version = chrome.runtime.getManifest().version;
  console.log(`[Groww Stock Tracker] Background ready - v${version}`);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'SAVE_TRACKED_STOCK') {
    return;
  }

  const rawPrice = typeof message.data?.price === 'number'
    ? message.data.price
    : parseFloat(String(message.data?.price || '').replace(/[₹,]/g, ''));

  if (!message.data || !message.data.symbol || !Number.isFinite(rawPrice)) {
    sendResponse({ ok: false, error: 'Invalid stock data.' });
    return;
  }

  chrome.storage.local.get(['trackedStocks'], (result) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }

    const tracked = result.trackedStocks || {};
    const previous = tracked[message.data.symbol] || {};

    tracked[message.data.symbol] = {
      ...previous,
      ...message.data,
      price: rawPrice,
      lastSeenPrice: Number.isFinite(previous.currentPrice) ? previous.currentPrice : rawPrice,
      currentPrice: rawPrice,
      timestamp: Date.now()
    };

    chrome.storage.local.set({ trackedStocks: tracked }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, data: tracked[message.data.symbol] });
    });
  });

  return true;
});
