# cdp - creep

Score puppeteer against Creep JS patching a few things

- Worker spoofing is a known challenge: patch inconsistency between worker environment and window
- Headless mode is necessary for PDF and it introduces extra "lies" => chrome object, webdriver, etc
- Getting response from the API is simpler than scraping the DOM and gives us the JSON already
- Achieved same score as real user-driven browser of 63.5 on my mac.

# Run

1. `npm install`
2. `node main.js`