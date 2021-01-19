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

async function find(){

    let params = {
        TableName: 'pivot-pay-test',
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames:{
            "#pk": "pk"
        },
        ExpressionAttributeValues: {
            ":pk": 'ORG#3b26e9a1-40e3-4f10-ac29-ef7bf7d4e412'
        }
    };

    const {Items} = await docClient.query(params).promise().catch(error =>  console.log(error));
    console.table(Items);
}
find();
// async function Main(){
//     let  params = {
//         TableName : 'go-time-prod',
//         KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk )`,
//         FilterExpression: '#date >= :date',
//         ExpressionAttributeNames:{
//             "#pk": "pk",
//             "#sk": "sk",
//             "#date": 'date'
            
//         },
//         ExpressionAttributeValues: {
//             ":userPK": "ORG#1003",
//             ":sk": `TIME#`,
//             ":date": '2021-01-04'
//         }
//     };
    
//     const {Items} = await docClient.query(params).promise().catch(error =>  console.log(error));
    
//     console.log(Items.length);

//     for(timeCard of Items){
//         let line = timeCard.costCenter;
//         line = line.replace('0','1');
//         timeCard.costCenter = line;
//         // console.log(timeCard);

        
//         let params = {
//             TableName: 'go-time-prod',
//             Item: timeCard
//         }

//         await docClient.put(params).promise();
//     }
//     console.log('done')
// }

// Main();
