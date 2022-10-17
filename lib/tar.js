'use strict'

const fs = require('fs');

// e.g.:  getFileDB('../docs/tiles/buffered.tar')

module.exports = {
	getFileTarDB,
}


function getFileTarDB(filename, opt = {}) {
	const files = new Map();
	const tarSize = fs.statSync(filename).size;
	const fd = fs.openSync(filename, 'r');
	scanTar(filename);
	
	return filename => {
		let entry = files.get(filename);
		let position = entry[0];
		let length = entry[1];
		let buffer = Buffer.allocUnsafe(length);
		fs.readSync(fd, buffer, 0, length, position)
		return buffer;
	}

	function scanTar(filename) {
		const bufferSize = 64*1204*1024;
		const buffer = Buffer.allocUnsafe(bufferSize);
		let bufferOffset = -1e30;

		let tarPos = 0;

		let i = 0;

		while (tarPos < tarSize) {
			if (i % 1000 === 0) process.stderr.write('\rreading tar: '+(100*tarPos/tarSize).toFixed(0)+'%');
			i++;

			let chunk = fastRead(tarPos);
		
			let filename = chunk.slice(0, 100).toString().replace(/\0+$/, '');
			filename = filename.replace(/^\.?\//, '');

			let filesize = parseInt(chunk.slice(124, 136).toString(), 8);
			let filetype = chunk.readInt8(156);

			let isDirectory;
			switch (filetype) {
				case 0: return;
				case 48: isDirectory = false; break;
				case 53: isDirectory = true; break;
				default:
					console.log({ filename, tarPos, filesize, filetype, isDirectory });
					throw Error(filetype)
			}

			tarPos += 512;

			if (isDirectory) continue;

			files.set(filename, [tarPos, filesize]);

			tarPos += Math.ceil(filesize / 512) * 512;
		}

		process.stderr.write('\rreading tar: 100%\n');

		function fastRead(tarPos) {
			let i = tarPos - bufferOffset;
			if ((i < 0) || (i+512 >= bufferSize)) {
				bufferOffset = Math.min(tarPos, tarSize - bufferSize);
				i = tarPos - bufferOffset;
				fs.readSync(fd, buffer, 0, bufferSize, bufferOffset);
			}
			return buffer.slice(i, i+512);
		}
	}
}
