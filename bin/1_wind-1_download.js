#!/usr/bin/node
'use strict'

const fs = require('fs');
const cheerio = require('cheerio');
const { fetch, download } = require('../lib/helper.js');
const config = require('../config.js');

(async () => {
   let html = await fetch('https://www.marktstammdatenregister.de/MaStR/Datendownload');
   let $ = cheerio.load(html);
   let downloadUrl = $('a[title=Download]').attr('href');
	let filename = config.getFilename.wind('marktstammdatenregister.zip');
	if (fs.existsSync(filename)) return;
   await download(downloadUrl, filename, true);
})()