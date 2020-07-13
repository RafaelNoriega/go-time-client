const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const passport = require('passport');

//default region is different than where the DynamoDb tables are.
const AWS_CONFIG = { 
  "region": "us-west-1",
  "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
  "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY
};

AWS.config.update(AWS_CONFIG);
const docClient = new dynamodb.DocumentClient();

/* GET users listing. */
router.post('/login', passport.authenticate('user', 
  { 
    failureRedirect: '/',
    failureFlash: true  
  }),
(req, res, next) => {

  res.redirect('/new-employee')
});

router.get('/logout', (req, res, next)=>{
  req.logout();
  return res.redirect('/');
});
module.exports = router;
