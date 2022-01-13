import dotenv from 'dotenv';
import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import * as https from 'https';
import * as process from 'process';
import puppeteer from 'puppeteer';
import logger from './logging';

dotenv.config();
logger();

// TODO: parse req.url and move map to location
// TODO: check directory of pregenerated images first
// TODO: some kind of process restart mechanism if things break

const DELIMITER = '#';

if (!process.env.URL) {
	console.log('No ShadeMap URL defined in .env file')
	process.exit(1);
}
if (!process.env.PORT) {
	console.log('No PORT specified in .env file')
	process.exit(1);
}

(async () => {
	const requestListener = async function (req: IncomingMessage, res: ServerResponse) {
		console.log(`Incoming request: ${req.url}`);
		try {
			if (req.url) {
				const [prefix, location] = req.url.split(DELIMITER);
				let [lat, lng, zoom, date, bearing, pitch] = location.split(',');

			}
		} catch {
		}

		var callback = function (response: any) {
			if (response.statusCode === 200) {
				res.writeHead(200, {
					'Content-Type': response.headers['content-type']
				});
				response.pipe(res);
			} else {
				res.writeHead(response.statusCode);
				res.end();
			}
		};

		https.request('https://shademap.app/og-image.png', callback).end();
	}

	console.log('Launching puppeteer');
	const browser = await puppeteer.launch();
	console.log('Opening new page');
	const page = await browser.newPage();
	console.log(`Loading ShadeMap: ${process.env.URL}`);
	await page.goto(process.env.URL || '', {
		waitUntil: 'networkidle2'
	});
	console.log('Starting server');
	const server = http.createServer(requestListener);
	server.listen(process.env.PORT);
	console.log(`Listening on ${process.env.PORT}`);
})();