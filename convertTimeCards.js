require('dotenv').config();

const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const moment = require('moment');

//default region is different than where the DynamoDb tables are.
const AWS_CONFIG = { 
    "region": "us-west-1",
    "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
    "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY
};

AWS.config.update(AWS_CONFIG);
const docClient = new dynamodb.DocumentClient();

async function Main(){
    let  params = {
        TableName : 'go-time-prod',
        KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
        ExpressionAttributeNames:{
            "#pk": "pk",
            "#sk": "sk",
            
        },
        ExpressionAttributeValues: {
            ":userPK": "ORG#1005",
            ":sk": `TIME#`,
        }
    };
    
    const {Items} = await docClient.query(params).promise().catch(error =>  console.log(error));
    
    console.log(Items.length);

    for(timeCard of Items){
        let line = timeCard.sk
        let lineItems = line.split('#');
        // console.log(lineItems)
        let newLine = `TIME#EMP#${lineItems[5]}#Date#${lineItems[3]}`;

        timeCard.sk = newLine;
        
        let params = {
            TableName: 'go-time-prod',
            Item: timeCard
        }

        await docClient.put(params).promise();
    }
}

Main();
