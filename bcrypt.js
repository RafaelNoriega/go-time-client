  
let bcrypt = require('bcryptjs');

var salt = bcrypt.genSaltSync(10);

let password = "Pivotpay1!";
let hash = bcrypt.hashSync(password, salt);

console.log(hash)

bcrypt.compare(password, hash, (err, res) =>{
    if(err){console.log('Error: ', err);}
    console.log(res);
})