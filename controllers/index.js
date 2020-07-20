const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const uuid = require('uuid/v1');
const moment = require('moment');
const { MachineLearning } = require('aws-sdk');

//default region is different than where the DynamoDb tables are.
const AWS_CONFIG = { 
    "region": "us-west-1",
    "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
    "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY
};

AWS.config.update(AWS_CONFIG);
const docClient = new dynamodb.DocumentClient();

exports.newEmployee = (req, res, next) => {
    async  function Main() {
        try {
                const {employeeId, firstName, middleName, lastName} = req.body;
                const {pk, groupId, ranch} = req.user;
                let params;
                console.log(req.body)
    
                if(employeeId == ''){
                    req.flash('error', 'Please enter a value for the employee Id');
                    return res.redirect('/new-employee');
                }else{
                    console.log('Employee Id: ',employeeId)
                    params = {
                        TableName: process.env.AWS_DATABASE,
                        Item: { 
                            pk,
                            sk: `EMP#${uuid()}`,
                            employeeId, 
                            firstName: firstName ? firstName : " ", 
                            middleName: middleName ? middleName: " ", 
                            lastName: lastName ? lastName : " ",
                            groupId,
                            ranch,
                            active: true,
                            role: 'user'
                        }
                    };
                    await docClient.put(params).promise().catch(error => req.flash('error', error));
                    req.flash('message', 'Succesfully added employee');
                    res.redirect('/new-employee');
                }
            } catch (error) {
                req.flash('error', JSON.stringify(error));
            }
    }
    Main();
}

exports.getTime = async (req, res, next) => {
    try {
        let user = req.user;
        let day = moment().format('YYYY-MM-DD')
        let params = {
            TableName : process.env.AWS_DATABASE,
            KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
            FilterExpression: "#active = :activeValue",
            ExpressionAttributeNames:{
                "#pk": "pk",
                "#sk": "sk",
                "#active": "active"
            },
            ExpressionAttributeValues: {
                ":userPK": user.pk,
                ":sk": 'EMP#',
                ":activeValue": true
            }
        };
        
        const {Items} = await docClient.query(params).promise().catch(error => console.log(error));
        //console.log(Items)
        Items.sort((a, b) => (a.lastName > b.lastName) ? 1 : -1)
        res.render('time', {user:req.user, employees:Items, day, message: req.flash('message'), error: req.flash('error')});
    } catch (error) {
        
    }
}

exports.newTime = async (req, res, next) => {
    try {
        const {employees, date, hours, breakTime} = req.body
        let employeesList = employees;
        console.log("employees: ", typeof(employees))
        const user = req.user;
        if(employees == undefined){
            req.flash('error', 'No employees were selected')
            res.redirect('/time');
        }else{
            if(typeof(employees) == "string"){
                employeesList = [employees];
            }   
            console.log(employees)
            for(let e of employeesList){  
                let params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": e
                    }
                };
        
                let {Items} = await docClient.query(params).promise().catch(error => console.log(error));
        
                params = {
                    TableName: process.env.AWS_DATABASE,
                    Item: {
                        pk: user.pk,
                        sk: `TIME#${user.groupId}#DATE#${date[0]}#EMP#${e.substring(4)}`,
                        date: moment(date[0]).format('YYYY-MM-DD'),
                        id: Items[0].employeeId,
                        firstName: Items[0].firstName,
                        middleName: Items[0].middleName,
                        lastName: Items[0].lastName,
                        hours,
                        breakTime,
                        pieces1: 0,
                        rate1: 0,
                        pieces2: 0,
                        rate2: 0,
                        pieces3: 0,
                        rate3: 0,
                        table: 0
                    }
                }
    
                await docClient.put(params).promise().catch(error => console.log(error))
            }
            req.flash('message', 'Time cards have been submitted')
            res.redirect('/time');
        }
    } catch (error) {
        console.log(error)
    }

}

exports.timeRecords = async (req, res, next) => {     
    try {
        let user = req.user;
        let startDate = moment().day(1).format('YYYY-MM-DD');
        let endDate   = moment().day(7).format('YYYY-MM-DD');

        res.render('records', {user, startDate, endDate})
   
    } catch (error) {
        console.log(error);
        res.render(res.render('records', {user, startDate, endDate}));
    }      
}

exports.timeRecordsData = async (req, res, next) => {
    try {
        let user = req.user;
        const {startDate, endDate} = req.query

        let params = {
            TableName : process.env.AWS_DATABASE,
            KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
            FilterExpression: "#date between :startDate and :endDate",
            ExpressionAttributeNames:{
                "#pk": "pk",
                "#sk": "sk",
                "#date": "date"
            },
            ExpressionAttributeValues: {
                ":userPK": user.pk,
                ":sk": `TIME#${user.groupId}`,
                ":startDate": startDate,
                ":endDate": endDate
            }
        };
        const {Items} = await docClient.query(params).promise().catch(error => req.flash('error', error));
        res.send(Items);

    } catch (error) {
        
    }
}

exports.timeRecordsDataUpdate = async (req, res, next) => {
    console.log(req.body)
    let user = req.user;
    const {row_id, col_name, col_val, call_type} = req.body;

    let params = {
        TableName:process.env.AWS_DATABASE,
        Key:{
            "pk": user.pk,
            "sk": row_id
        },
        UpdateExpression: "set #column = :value",
        ExpressionAttributeNames: {
            "#column": col_name
        },
        ExpressionAttributeValues:{
            ":value": col_val
        },
        ReturnValues:"UPDATED_NEW"
    };
    
    console.log("Updating the item...");
    await docClient.update(params).promise().catch(error => console.log(error));
    return res.sendStatus(200)
}