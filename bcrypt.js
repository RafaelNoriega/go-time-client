  
let bcrypt = require('bcryptjs');

let password = "password";
var salt = bcrypt.genSaltSync(10);

let hash = bcrypt.hashSync(password, salt);

console.log(hash)

bcrypt.compare(password, hash, (err, res) =>{
    if(err){console.log('Error: ', err);}
    console.log(res);
})