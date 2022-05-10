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

function listFiles(res: ServerResponse) {
	fs.readdir(path.join('public', 'images'), (err, files) => {
		if (err) {
			res.end();
		}
		const fileObjs = files.map(file => {
			return {
				created: fs.statSync(path.join('public', 'images', file)).mtime.getTime(),
				name: file,
			}
		});
		fileObjs.sort((a, b) => {
			return b.created - a.created;
		});
		const html = fileObjs.slice(0, 20).map((fileObj) => {
			const coords = fileObj.name.replace('.png', '');
			return `${new Date(fileObj.created).toISOString().replace('T', ' ').replace('Z', '')}
			- <a href="${process.env.URL}/@${coords}">${fileObj.name}.png</a> 
			- <a href="https://shademap.app/@${coords}}">Map</a>
			<br>`;
		}).join('');

		res.writeHead(200, {
			'Content-Type': 'text/html',
		})
		res.end(`<html><body>${html}</body></html>`);
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
	if (req.url === (process.env.URL + '/list')) {
		listFiles(res);
		return;
	}
	if (req.url.startsWith(process.env.URL + '/loc')) {
		try {
			if (!inProgress && page && req.url) {
				// get lat, lng, date from body
				inProgress = true;
				const { lat, lng, zoom, date } = parseUrl(req.url);
				const inShade = await page.evaluate(async ({ lat, lng, zoom, date }) => {
					await (window as any).setLocation(lat, lng, zoom, date, 0, 0);
					const point = (map as any).project({ lat, lng });
					const [r, g, b, a] = (shadeMap as any).readPixel(point.x, point.y);
					const inShade = a !== 0 ? 1 : 0; // if alpha is 0, no shade in this location
					return inShade;
				}, { lat, lng, zoom, date })
				res.writeHead(200, {
					'Content-Type': 'application/json',
				})
				res.end(JSON.stringify({ date, lat, lng, zoom, inShade }));
			}
		} catch (e) {
			console.log(e)
			res.writeHead(500, {
				'Content-Type': 'application/json',
			});
			res.end();
		} finally {
			inProgress = false;
		}
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
				await (window as any).setLocation(lat, lng, zoom, date, bearing, pitch);
			}, { lat, lng, zoom, date, bearing, pitch })

			console.log(`Capturing screenshot`);
			const screenshot = await page.screenshot() as Buffer;

			console.log(`Setting pitch back to 0`);
			page.evaluate(async ({ lat, lng, zoom, date, bearing, pitch }) => {
				(window as any).setLocation(lat, lng, zoom, date, bearing, pitch);
			}, { lat, lng, zoom, date, bearing, pitch: 0 });

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
