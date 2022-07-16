'use strict'

const fs = require('fs');

// e.g.:  getFileDB('../docs/tiles/buffered.tar')

module.exports = {
	getFileTarDB,
}


function getFileTarDB(filename, opt = {}) {
	const buffer = fs.readFileSync(filename);
	const files = new Map();
	parseTar();
	return files;

	function parseTar() {
		let bufferPos = 0;
		let bufferSize = buffer.length;
		let count = 0;
		while (bufferPos < bufferSize) {
			let filename = buffer.slice(bufferPos, bufferPos + 100).toString().replace(/\0+$/, '');
			let filesize = parseInt(buffer.slice(bufferPos + 124, bufferPos + 136).toString(), 8);
			let filetype = buffer.readInt8(bufferPos + 156);

			let isDirectory;
			switch (filetype) {
				case 0: return;
				case 48: isDirectory = false; break;
				case 53: isDirectory = true; break;
				default:
					console.log({ filename, bufferPos, filesize, filetype, isDirectory });
					throw Error(filetype)
			}

			if (opt.progress && (count % 1024 === 0)) process.stderr.write('\r' + (100 * bufferPos / bufferSize).toFixed(2) + '%');
			count++;
			bufferPos += 512;

			if (isDirectory) continue;

			files.set(filename, buffer.slice(bufferPos, bufferPos + filesize));
			bufferPos += Math.ceil(filesize / 512) * 512;
		}
	}
}
