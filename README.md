# Groww Stock Tracker Chrome Extension

A sleek Chrome extension to track and compare stock prices on Groww.in. Save stock prices and monitor price changes over time with a beautiful financial terminal interface.

## Features

✨ **One-Click Tracking**: Click the floating "Track" button on any Groww stock page to save the current price

📊 **Price Comparison**: Compare saved prices with current prices and see the difference

📈 **Visual Change Indicators**: Green/red indicators show gains and losses at a glance

🎯 **Clean Interface**: Financial terminal-inspired design with dark theme

💾 **Persistent Storage**: All tracked stocks are saved locally using Chrome's storage API

## Installation

### Method 1: Load Unpacked Extension (Developer Mode)

1. **Download the extension files** to a folder on your computer

2. **Open Chrome Extensions page**:
   - Go to `chrome://extensions/`
   - Or click the three dots menu → More Tools → Extensions

3. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top right corner

4. **Load the extension**:
   - Click "Load unpacked"
   - Select the folder containing the extension files
   - The extension icon should appear in your toolbar

## Usage

### Tracking a Stock

1. Visit any stock page on Groww (e.g., https://groww.in/stocks/reliance-industries-ltd)
2. A purple "Track" button will appear in the bottom right corner
3. Click the button to save the current stock price
4. The button will show "Tracked!" confirmation

### Viewing Tracked Stocks

1. Click the extension icon in your Chrome toolbar
2. View all your tracked stocks with:
   - Saved price (when you tracked it)
   - Current price
   - Price difference and percentage change
   - Color-coded indicators (green = up, red = down)

### Managing Stocks

- **Refresh Prices**: Click the "Refresh Prices" button to update all current prices
- **Delete Individual Stock**: Click the trash icon on any stock card
- **Clear All**: Click "Clear All" to remove all tracked stocks
- **Visit Stock Page**: Click "Visit" link on any card to open the stock page

## How It Works

The extension uses:
- **Content Script**: Runs on Groww pages to detect stock information and add the tracking button
- **Popup Interface**: Shows your tracked stocks when you click the extension icon
- **Chrome Storage**: Saves all data locally on your browser
- **Real-time Updates**: Monitors price changes and calculates differences

## Notes

- **Price Updates**: The "Refresh Prices" feature simulates price updates. For real-time prices, visit the stock pages directly
- **Data Storage**: All data is stored locally in your browser - no data is sent to any server
- **Groww Compatibility**: Works with Groww's current website structure (as of 2024)

## Customization

You can customize the extension by editing:
- `popup.css`: Change colors, fonts, and styling
- `content.js`: Modify the tracking button appearance and behavior
- `popup.js`: Adjust the price display format and calculations

## Troubleshooting

**Track button not appearing?**
- Make sure you're on a Groww stock page (URL contains `/stocks/`)
- Refresh the page
- Check that the extension is enabled in chrome://extensions/

**Stocks not saving?**
- Check Chrome's storage permissions
- Make sure the extension has proper permissions

**Extension not loading?**
- Verify all files are in the same folder
- Check for console errors in chrome://extensions/
- Ensure manifest.json is valid

## Files Structure

```
groww-stock-tracker/
├── manifest.json       # Extension configuration
├── popup.html          # Main popup interface
├── popup.css          # Styling
├── popup.js           # Popup logic
├── content.js         # Groww page integration
├── icon16.png         # Extension icon (16x16)
├── icon48.png         # Extension icon (48x48)
├── icon128.png        # Extension icon (128x128)
└── README.md          # This file
```

## Privacy

This extension:
- ✅ Only works on Groww.in
- ✅ Stores all data locally in your browser
- ✅ Does not send any data to external servers
- ✅ Does not track your browsing history
- ✅ Requires minimal permissions

## Support

If you encounter any issues or have suggestions, feel free to modify the code to suit your needs!

## License

Free to use and modify for personal use.
