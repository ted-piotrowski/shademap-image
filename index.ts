import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://shademap.app/#37.74392,-119.56306,11.42013z,1641492931979t,-132.33425b,45p', {
      waitUntil: 'networkidle2'
  });
  await page.screenshot({ path: 'example.png' });

  await browser.close();
})();
