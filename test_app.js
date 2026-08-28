const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`);
  });
  
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  console.log("Navigating to index.html...");
  await page.goto('file:///' + __dirname.replace(/\\/g, '/') + '/index.html', { waitUntil: 'networkidle0' });
  
  console.log("Page loaded. Checking cases...");
  try {
    const cases = await page.evaluate(() => window.Shrinkhala.App.getState().cases);
    console.log("Cases in state: ", JSON.stringify(cases));
  } catch(e) {
    console.log("Failed to get cases: " + e.message);
  }

  await browser.close();
})();
