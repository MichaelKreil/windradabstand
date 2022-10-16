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
		let tarPos = 0;
		const chunk = Buffer.allocUnsafe(512);

		let i = 0;

		while (tarPos < tarSize) {
			if (i % 1000 === 0) process.stderr.write('\rreading tar: '+(100*tarPos/tarSize).toFixed(0)+'%');
			i++;

			fs.readSync(fd, chunk, 0, 512, tarPos);
		
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
	}
}
