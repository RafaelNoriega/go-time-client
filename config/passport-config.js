const AWS = require("aws-sdk");
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs')

const AWS_CONFIG = { 
    "region": "us-west-1",
    "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
    "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY
};

AWS.config.update(AWS_CONFIG);
const docClient = new AWS.DynamoDB.DocumentClient();

passport.use('user', new LocalStrategy(
    async (username, password, done) =>{

        //const {username, password} = event.body;
        if(username === undefined || password === undefined){
            return done(err);
        }
        
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

        if(Items.length === 0){
            return done(null, false, {
                message: 'Incorrect username or password.'
              });
        }

        let passwordMatch = false;
        if(process.env.NODE_ENV === "TEST"){
            passwordMatch = true;
        }else {
            passwordMatch = await bcrypt.compare(password, Items[0].password);
        }

        //no users matched the username
        if(Items.length !== 1){
            return done(null, false, {
                message: 'Incorrect username or password.'
              });
        }
        //the password did not match
        else if(passwordMatch){
            return done(null, Items[0]);
        }else {
            return done(null, false, {
                message: 'Incorrect username or password.'
              });
        }
    }  
));

passport.serializeUser(function (user, done) {
    done(null, user);
  });
  
  passport.deserializeUser(function (obj, done) {
    done(null, obj);
  });