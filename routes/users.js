const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const passport = require('passport');
const {userCheck, userCheckAdmin} = require('../middleware/loggedin');

//default region is different than where the DynamoDb tables are.
const AWS_CONFIG = { 
  "region": "us-west-1",
  "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
  "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY
};

AWS.config.update(AWS_CONFIG);
const docClient = new dynamodb.DocumentClient();

router.get('/checkUsername', userCheckAdmin, async (req, res, next) => {
  
  const {username} = req.query;

  let params = {
    TableName :  process.env.AWS_DATABASE,
    IndexName: "username-index",
    KeyConditionExpression: "#user = :user",
    ExpressionAttributeNames:{
        "#user": "username"
    },
    ExpressionAttributeValues: {
        ":user": username
    }
  };

  const {Items} = await docClient.query(params).promise().catch(error => console.log(error));

  if(Items.length == 0){
      res.status(200).send('No user found');
  }else{
    res.status(200).send('User Found');
  }

});

/* GET users listing. */
router.post('/login', passport.authenticate('user', 
  { 
    failureRedirect: '/',
    failureFlash: true  
  }),
(req, res, next) => {

  const {user} = req;
  if(req.user.pk.includes("ACC") ){
    console.log("Admin User");
    res.redirect('/admin');
  }else if(req.user.pk.includes("SYS")){
    console.log("Admin User");

    res.redirect('/systemAdmin')
  }
  res.redirect('/time')
});

router.get('/logout', (req, res, next)=>{
  req.logout();
  return res.redirect('/');
});
module.exports = router;
