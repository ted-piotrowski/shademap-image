import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', message => console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`));
  page.on('pageerror', ({ message }) => console.log(message));
  page.on('response', response => console.log(`${response.status()} ${response.url()}`));
  page.on('requestfailed', request => console.log(`${(request.failure() || { errorText: 'requestFailure' }).errorText} ${request.url()}`));

  await page.goto('http://localhost:3000/#37.74392,-119.56306,11.42013z,1641492931979t,-132.33425b,45p', {
    waitUntil: 'networkidle2'
  });
  await page.screenshot({ path: 'example.png' });

  await browser.close();
})();
