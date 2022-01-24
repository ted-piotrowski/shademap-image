import dotenv from 'dotenv';
import * as fs from 'fs';
import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import * as path from 'path';
import * as process from 'process';
import puppeteer from 'puppeteer';
import logger from './logging';

dotenv.config();
logger();

if (!process.env.URL) {
	console.log('No ShadeMap URL defined in .env file')
	process.exit(1);
}
if (!process.env.DELIMITER) {
	console.log('No URL delimiter defined in .env file')
	process.exit(1);
}
if (!process.env.PORT) {
	console.log('No PORT specified in .env file')
	process.exit(1);
}

let page: puppeteer.Page;

(async () => {
	startServer();
	page = await startPuppeteer();
})();

async function startPuppeteer() {
	console.log('Launching puppeteer');
	const browser = await puppeteer.launch();
	console.log('Opening new page');
	const page = await browser.newPage();
	await page.setViewport({
		width: 1200,
		height: 630,
	})
	page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
	console.log(`Loading ShadeMap: ${process.env.URL}`);
	await page.goto(`http://localhost:${process.env.PORT}${process.env.URL}`, {
		waitUntil: 'networkidle2'
	});
	console.log(`Loaded ShadeMap`);
	return page;
}

async function startServer() {
	console.log('Starting server');
	const server = http.createServer(requestListener);
	server.listen(process.env.PORT);
	console.log(`Listening on ${process.env.PORT}`);
}

let inProgress = false;

function parseUrl(url: string) {
	const [prefix, location] = url.split(process.env.DELIMITER || '');
	const [latS, lngS, zoomS, dateS, bearingS = "0b", pitchS = "0p"] = location.split(',');
	const lat = parseFloat(latS);
	const lng = parseFloat(lngS);
	const zoom = parseFloat(zoomS.slice(0, -1));
	const date = parseInt(dateS.slice(0, -1), 10);
	const bearing = parseFloat(bearingS);
	const pitch = parseFloat(pitchS);
	const filename = `${location}.png`;
	console.log(`parsedUrl: ${JSON.stringify({ lat, lng, zoom, date, bearing, pitch, filename })}`)
	if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(zoom) || Number.isNaN(date)) {
		throw new Error(`Invalid url format ${url}`)
	}
	return { lat, lng, zoom, date, bearing, pitch, filename };
}

function sendFile(res: ServerResponse, fileName: string, contentType: string) {
	fs.readFile(path.join('public', fileName), (err, data) => {
		if (err) {
			res.writeHead(500);
			res.end();
		}
		res.writeHead(200, {
			'Content-Type': contentType,
		})
		res.end(data);
	})
}

async function checkForFile(filename: string): Promise<boolean> {
	console.log(`Checking if ${filename} already exists`);
	return new Promise((res, rej) => {
		fs.stat(path.join(filename), (err) => {
			if (err === null) {
				res(true);
			} else {
				res(false);
			}
		})
	});
}

function elapsed(start: number) {
	console.log(`Request took ${(Date.now() - start) / 1000} seconds`)
}

let window = 'shim';
let map = { once: (a: any, b: any) => console.log('shim') };
let shadeMap = { flushSync: () => console.log('shim') };

async function requestListener(req: IncomingMessage, res: ServerResponse) {
	const start = Date.now();
	if (req.url === process.env.URL) {
		sendFile(res, 'index.html', 'text/html');
		return;
	}
	if (req.url === '/favicon.ico') {
		res.end();
		return;
	}

	console.log(`Incoming request: ${req.url}, inProgress: ${inProgress}`);
	try {
		if (!inProgress && page && req.url) {
			inProgress = true;
			const { lat, lng, zoom, date, bearing, pitch, filename } = parseUrl(req.url);

			const fileExists = await checkForFile(path.join('public', 'images', filename));

			if (fileExists) {
				console.log(`${filename} already exists, serve from public/`);
				sendFile(res, path.join('images', filename), 'image/png');
				elapsed(start);
				return;
			}

			console.log(`${filename} does not exist, moving Shademap to new coordinates`)
			await page.evaluate(async ({ lat, lng, zoom, date, bearing, pitch }) => {
				(window as any).setLocation(lat, lng, zoom, date, bearing, pitch);
				await new Promise((res, rej) => {
					map.once('idle', res);
				});
			}, { lat, lng, zoom, date, bearing, pitch })

			console.log(`Waiting for network idle`);
			await page.waitForNetworkIdle();

			console.log(`Flushing ShadeMap GPU`);
			await page.evaluate(() => {
				shadeMap.flushSync();
			})

			console.log(`Capturing screenshot`);
			const screenshot = await page.screenshot() as Buffer;
			console.log(`Sending screenshot`);
			res.writeHead(200, {
				'Content-Type': 'image/png',
			})
			res.end(screenshot);
			console.log(`Saving ${filename}`);
			fs.writeFile(path.join('public', 'images', filename), screenshot, () => {
				console.log(`Saved ${filename}`);
			});
			elapsed(start);
			return;
		}
	} catch (e) {
		console.log(e)
	} finally {
		inProgress = false;
	}
	sendFile(res, path.join('og-image.png'), 'image/png');
	elapsed(start);
}
