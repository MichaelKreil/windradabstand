#!/usr/bin/node
'use strict'

const { fetch, download } = require('../lib/helper.js');
const cheerio = require('cheerio');
const config = require('../config.js');

(async () => {
   let html = await fetch('https://www.marktstammdatenregister.de/MaStR/Datendownload');
   let $ = cheerio.load(html);
   let downloadUrl = $('a[title=Download]').attr('href');
   await download(downloadUrl, config.getFilename.wind('marktstammdatenregister.zip'), true);
   console.log('\nFinished')
})()