export default () => {
	const fs = require('fs');
	const util = require('util');
	const logFile = fs.createWriteStream('log.txt', { flags: 'a' });
	// Or 'w' to truncate the file every time the process starts.
	const logStdout = process.stdout;

	console.log = function () {
		const now = new Date();
		const date = now.toLocaleDateString();
		const time = now.toLocaleTimeString();
		logFile.write(`${date} ${time} ${util.format.apply(null, arguments)} \n`);
		logStdout.write(`${date} ${time} ${util.format.apply(null, arguments)} \n`);
	}
	console.error = console.log;
}
