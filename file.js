const fs = require('fs');
const moment = require('moment');
const { request } = require('express');

fs.writeFile(`./exports/${moment().format('MM-DD-YYYY')}.txt`, 'Hello World!', err => req.flash('error' , err));