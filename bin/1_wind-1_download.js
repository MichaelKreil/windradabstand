#!/usr/bin/node
'use strict'

const fs = require('fs');
const cheerio = require('cheerio');
const { fetch, download } = require('../lib/helper.js');
const config = require('../config.js');

(async () => {
	let filename = config.getFilename.wind('marktstammdatenregister.zip');
	let filenameTmp = config.getFilename.wind('marktstammdatenregister.zip.tmp');
	if (fs.existsSync(filename)) return console.log('file already exists:',filename);

   let html = await fetch('https://www.marktstammdatenregister.de/MaStR/Datendownload');
   let $ = cheerio.load(html);
   let downloadUrl = $('a[title=Download]').attr('href');
   
	await download(downloadUrl, filenameTmp, true);
	fs.renameSync(filenameTmp, filename)
})()