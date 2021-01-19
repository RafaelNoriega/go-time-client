  
let bcrypt = require('bcryptjs');

var salt = bcrypt.genSaltSync(10);

let password = "C6P+y3SA";
let hash = bcrypt.hashSync(password, salt);

console.log(hash)

bcrypt.compare(password, hash, (err, res) =>{
    if(err){console.log('Error: ', err);}
    console.log(res);
})