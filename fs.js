let fs = require('fs');

fs.readFile('./exports/EmployeeUploadTemplate.csv', 'utf8', (err, data) => {
    let rows = data.split('\n');
    console.log(rows);
});