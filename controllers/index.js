const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const { v4: uuid } = require('uuid');
const moment = require('moment');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const salt = bcrypt.genSaltSync(10);
const { KeyObject } = require('crypto');
const { env } = require('process');
const formidable = require('formidable');
const { param } = require('../routes');
const { resolve } = require('path');
const { start } = require('repl');
const { ProcessCredentials } = require('aws-sdk');

//default region is different than where the DynamoDb tables are.
const AWS_CONFIG = { 
    "region": "us-west-1",
    "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
    "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY
};

AWS.config.update(AWS_CONFIG);
const docClient = new dynamodb.DocumentClient();

exports.admin = (req, res, next) =>{
    res.render('admin', {user:req.user});
}

exports.adminSet = (req, res, next) => {
    let org = req.params.org;
    let user = req.user;
    user['originalPK'] = user.pk;
    user['pk'] = org.replace('_', '#');

    req.login(user, error => {
        if (error) { return next(error); }
        return res.redirect('/time');
    })
}

exports.adminReset = (req, res, next) => {
    let user = req.user;
    user['pk'] = user.originalPK;
    delete user['originalPK'];

    req.login(user, error => {
        if (error) { return next(error); }
        return res.redirect('/admin');
    });
}

exports.adminNewCrew = (req, res, next) => {
    try {
        console.log(req.body);
        
        const {crewName, foremanUsername, foremanPassword, foremanFirst, foremanLast, foremanMiddle, growers} = req.body;

        const employeeId = uuid();
        const crewUUID = uuid();
        const user = req.user;
        const pk = `ORG#${crewUUID}`;

        let growersList = [];
        let costCenters = [];
        if(Array.isArray(growers)){
            for(let growerSet of growers){
                let grower = growerSet.split(',');  
                
                let set = {growerName: grower[0].replace(/_/g, ' '), growerId: grower[1]};
                growersList.push(set);
    
                let costCenterSet = {name: grower[0].replace(/_/g, ' '), code: grower[1]};
                costCenters.push(costCenterSet);
            }
        }else{
            let grower = growers.split(',');

            let set = {growerName: grower[0].replace(/_/g, ' '), growerId: grower[1]};
            growersList.push(set);
    
            let costCenterSet = {name: grower[0].replace(/_/g, ' '), code: grower[1]};
            costCenters.push(costCenterSet);
        }

        const orgListNewCrew = {
            growers: growersList, 
            name: crewName, 
            org: pk,
            dateCreated: new Date().toISOString(),
            status: 'active'
        };

        const newCrew = {
            costCenters,
            name: crewName,
            pk,
            sk: "METADATA",
            dateCreated: new Date().toISOString(),
            status: 'active'
        }

        
        const params = {
            TransactItems: [{
              Put: {
                    TableName: process.env.AWS_DATABASE,
                    Item: newCrew
              }
            }, {
              Update: {
                TableName: process.env.AWS_DATABASE,
                Key: { 
                    pk: user.pk,
                    sk: "METADATA"
                },
                UpdateExpression: 'set #accounts = list_append( if_not_exists(#accounts, :emptyList), :newAccount )',
                ExpressionAttributeNames: {'#accounts' : 'orgList'},
                ExpressionAttributeValues: {
                  ':newAccount' : [orgListNewCrew],
                  ':emptyList' : []
                }
              }
            }, {
                Put: {
                    TableName :  process.env.AWS_DATABASE,
                    Item: {
                        active: true,
                        employeeId,
                        firstName: foremanFirst,
                        lastName: foremanLast,
                        middleName: foremanMiddle,
                        password: bcrypt.hashSync(foremanPassword, salt),
                        pk,
                        sk: `EMP#${employeeId}`,
                        position: 'manager',
                        ranch: '',
                        username: foremanUsername,
                    }
                }
            }]
          };
        
        docClient.transactWrite(params, (err, data) => {
            if (err) console.log(err);
            else {
                let oldList = user.orgList;
                let newList = oldList.concat([orgListNewCrew]);
                user.orgList = newList;
                req.login(user, error => {
                    if (error) { throw "Could not update user with req.login()"; }
                    return res.redirect('/admin');
                })
            }
        });

    } catch (error) {
        console.log(error);
        res.redirect('/admin');
    }
}

exports.adminDeleteCrew = async (req, res, next) => {
    try {
        let user = req.user;
        let crewId = req.params.crew.replace('_', '#');

        let newList = user.orgList.filter( obj => {
            return obj.org != crewId;
        });

        //Query all data using the PK then delete one at a time.
        const getParams = {
            TableName: process.env.AWS_DATABASE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames:{
                "#pk": "pk"
            },
            ExpressionAttributeValues: {
                ":pk": crewId
            }
        };

        let {Items} = await docClient.query(getParams).promise().catch(error => console.log(error));
        console.log(Items.length)

        for(item of Items){
            let deleteItem = {
                TableName: process.env.AWS_DATABASE,
                Key:{
                    pk: item.pk,
                    sk: item.sk
                }
            };
            await docClient.delete(deleteItem).promise().catch(error => console.log(error));
        }

        const params = {
            TransactItems: [
            {
                Update: {
                    TableName: process.env.AWS_DATABASE,
                    Key: { 
                        pk: user.pk,
                        sk: "METADATA"
                    },
                    UpdateExpression: 'set #accounts =  :newAccountList',
                    ExpressionAttributeNames: {'#accounts' : 'orgList'},
                    ExpressionAttributeValues: {
                    ':newAccountList' : newList
                    }
                }
            }]
          };        

        docClient.transactWrite(params, (err, data) => {
            if (err) console.log(err);
            else {
                user.orgList = newList;
                req.login(user, error => {
                    if (error) { throw "Could not update user with req.login()"; }
                    return res.redirect('/admin');
                });
            }
        });

    } catch (error) {
        console.log(error);
        return res.redirect('/admin');
    }
}

exports.getEmployees = async (req, res, next)=>{
    const {user} = req;

    let params = {
        TableName : process.env.AWS_DATABASE,
        KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
        FilterExpression: "#active = :activeValue OR #active = :activeValueString",
        ExpressionAttributeNames:{
            "#pk": "pk",
            "#sk": "sk",
            "#active": "active"
        },
        ExpressionAttributeValues: {
            ":userPK": user.pk,
            ":sk": 'EMP#',
            ":activeValue": true,
            ":activeValueString": 'true'
        }
    };
    
    const {Items} = await docClient.query(params).promise().catch(error => console.log(error));
    let employees = Items.sort((a, b) => (a.lastName > b.lastName) ? 1 : -1)
    res.send(employees.filter(e => e.position == 'worker'));
}
exports.newEmployee = (req, res, next) => {
    async  function Main() {
        try {
                const {employeeId, firstName, middleName, lastName, position} = req.body;
                const {pk, groupId, ranch} = req.user;
                let params;
    
                if(employeeId == ''){
                    req.flash('error', 'Please enter a value for the employee Id');
                    return res.redirect('/new-employee');
                }else{
                    
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
                            role: 'user',
                            position
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
exports.employeeBulkUpload = async (req, res, next) => {
    try {
        let {user} = req;
        let form = new formidable.IncomingForm();

        form.parse(req, (err, fields, files) => {
            if(err) console.log(err);

            let oldPath = files.uploadFile.path;
            let newPath = './exports/' + files.uploadFile.name;

            fs.rename(oldPath, newPath, function (err) {
              if (err) console.log(err);

              fs.readFile(newPath, 'utf8', async (err, data) => {
                if(err){
                    console.log(err)
                }else{
                    let rows = data.split('\n');
                    console.log(rows.length);
                    for(let i = 1; i<rows.length; i++){
                        let row = rows[i].split(',');

                        let employee = {
                            active: true,
                            employeeId: row[0],
                            firstName: row[1],
                            lastName: row[2],
                            middleName: row[3],
                            pk: user.pk,
                            position: row[4],
                            sk: `EMP#${uuid()}`
                          };

                          let params = {
                              TableName: process.env.AWS_DATABASE,
                              Item: employee
                          };

                          await docClient.put(params).promise().catch(error => console.log(error));
                    }

                    console.log('added employees');

                    fs.unlinkSync(newPath, error => console.log(error));
                    req.flash('message', 'Successfully added employee');
                    res.redirect('/new-employee');
                }
              });
            });
        }); 
    } catch (error) {
        console.log(error);
    }
}
exports.updateEmployee = async (req, res, next)=>{
    const {user} = req;
    const {row_id, col_name, col_val} = req.body;
    console.log('Column Name: ',col_name)

    if(col_name == 'delete'){
        let params = {
            TableName:process.env.AWS_DATABASE,
            Key:{
                "pk": user.pk,
                "sk": row_id
            }
        }

        await docClient.delete(params).promise().catch(error => console.log(error));
        return res.sendStatus(200)
    }else{
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
        }
        console.log("Updating the item...");
        await docClient.update(params).promise().catch(error => console.log(error));

        if(col_name == 'employeeId'){
            console.log(row_id.substring(4))
            let params = {
                TableName:process.env.AWS_DATABASE,
                KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                ExpressionAttributeNames:{
                    "#pk": "pk",
                    "#sk": "sk",
                },
                ExpressionAttributeValues: {
                    ":userPK": user.pk,
                    ":sk": `TIME#EMP#${row_id.substring(4)}`,
                }
            }
            let {Items} = await docClient.query(params).promise().catch(error => console.log("error: ", error));
            console.log("Items: ", Items.length);
            for(let row of Items){

                row.id = col_val;
                console.log(row);
                let params = { 
                    TableName:process.env.AWS_DATABASE,
                    Item: row
                }

                await docClient.put(params).promise().catch(error => console.log(error));
            }
        }
        return res.sendStatus(200);       
    }

}

exports.getTime = async (req, res, next) => {
    try {
        const {user} = req;
        let day = moment().format('YYYY-MM-DD')
        let params = {
            TableName : process.env.AWS_DATABASE,
            KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
            FilterExpression: "#active = :activeValue OR #active = :activeValueString",
            ExpressionAttributeNames:{
                "#pk": "pk",
                "#sk": "sk",
                "#active": "active"
            },
            ExpressionAttributeValues: {
                ":userPK": user.pk,
                ":sk": 'EMP#',
                ":activeValue": true,
                ":activeValueString": 'true'
            }
        };
        
        const {Items} = await docClient.query(params).promise().catch(error => console.log(error));
        
        params = {
            TableName : process.env.AWS_DATABASE,
            KeyConditionExpression: `#pk = :userPK AND #sk = :sk`,
            ExpressionAttributeNames:{
                "#pk": "pk",
                "#sk": "sk",
            },
            ExpressionAttributeValues: {
                ":userPK": user.pk,
                ":sk": 'METADATA'
            }
        }

        let costCenters = await docClient.query(params).promise().catch(error => console.log(error));
        costCenters = costCenters.Items[0].costCenters; 
        
        let employees = Items.sort((a, b) => (a.lastName > b.lastName) ? 1 : -1)

        res.render('time', {user, employees: employees.filter(e => e.position == 'worker'), day, costCenters, message: req.flash('message'), error: req.flash('error')});
    } catch (error) {
        
    }
}

exports.newTime = async (req, res, next) => {
    try {
        const {employees, date, hours, breakTime, costCenter, rate1, rate2, rate3} = req.body
        let employeesList = employees;
        typeof date == 'string'? safeDate = date: safeDate=date[0];
        const {user} = req;
        if(employees == undefined){
            req.flash('error', 'No employees were selected')
            res.redirect('/time');
        }else{
            if(typeof employees == 'string'){
                console.log('single employee')
                employeesList = [employees];
            }   

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

                if(Items[0].position === 'manager'){
                    params = {
                        TableName: process.env.AWS_DATABASE,
                        Item: {
                            pk: user.pk,
                            sk: `TIME#EMP#${e.substring(4)}#DATE#${date}`,
                            date: moment(date).format('YYYY-MM-DD'),
                            id: Items[0].employeeId,
                            firstName: Items[0].firstName,
                            middleName: Items[0].middleName,
                            lastName: Items[0].lastName,
                            hours: 0,
                            flatRate: 0,
                            breakTime: 0,
                            pieces1: 0,
                            rate1,
                            pieces2: 0,
                            rate2,
                            pieces3: 0,
                            rate3,
                            table: 0,
                            costCenter,
                            exported: false,
                            pieceOnly: false,
                            position: Items[0].position
                        }
                    }
                }else if(Items[0].position === 'worker'){
                    params = {
                        TableName: process.env.AWS_DATABASE,
                        Item: {
                            pk: user.pk,
                            sk: `TIME#EMP#${e.substring(4)}#DATE#${date}`,
                            date: moment(date).format('YYYY-MM-DD'),
                            id: Items[0].employeeId,
                            firstName: Items[0].firstName,
                            middleName: Items[0].middleName,
                            lastName: Items[0].lastName,
                            hours,
                            flatRate: 0,
                            breakTime,
                            pieces1: 0,
                            rate1,
                            pieces2: 0,
                            rate2,
                            pieces3: 0,
                            rate3,
                            table: 0,
                            costCenter,
                            exported: false,
                            pieceOnly: false,
                            position: Items[0].position
                        }
                    }
                }
    
                await docClient.put(params).promise().catch(error => console.log("Error Submitting Timecard: ",error))
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
        let startDate = moment().format('YYYY-MM-DD');
        let endDate = moment().format('YYYY-MM-DD');
        //let endDate   = moment().day(7).format('YYYY-MM-DD');
        params = {
            TableName : process.env.AWS_DATABASE,
            KeyConditionExpression: `#pk = :userPK AND #sk = :sk`,
            ExpressionAttributeNames:{
                "#pk": "pk",
                "#sk": "sk",
            },
            ExpressionAttributeValues: {
                ":userPK": user.pk,
                ":sk": 'METADATA'
            }
        }

        let costCenters = await docClient.query(params).promise().catch(error => console.log(error));
        costCenters = costCenters.Items[0].costCenters; 

        res.render('records', {user, startDate, endDate, costCenters})
   
    } catch (error) {
        console.log(error);
        res.render(res.render('records', {user, startDate, endDate}));
    }      
}

exports.timeRecordsData = async (req, res, next) => {
    try {
        const {user} = req;
        const {startDate, endDate, costCenter, employeeId} = req.query
        let params;

        console.log(startDate);
        console.log(endDate);

        //no filter
        if(costCenter === 'ALL' && employeeId === ''){
            params = {
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
                    ":sk": `TIME`,
                    ":startDate": startDate,
                    ":endDate": endDate
                }
            };
        }
        //filtered employee ONLY
        else if(employeeId !== '' && costCenter === 'ALL'){
            params = {
                TableName : process.env.AWS_DATABASE,
                KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                FilterExpression: "#date between :startDate and :endDate AND #id = :id",
                ExpressionAttributeNames:{
                    "#pk": "pk",
                    "#sk": "sk",
                    "#date": "date",
                    "#id": "id"
                },
                ExpressionAttributeValues: {
                    ":userPK": user.pk,
                    ":sk": `TIME`,
                    ":startDate": startDate,
                    ":endDate": endDate,
                    ":id": employeeId
                }
            }
        }
        //filtered Cost Center ONLY
        else if(costCenter !== 'ALL' && employeeId === ''){
            params = {
                TableName : process.env.AWS_DATABASE,
                KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                FilterExpression: "#date between :startDate and :endDate AND #costCenter = :costCenter",
                ExpressionAttributeNames:{
                    "#pk": "pk",
                    "#sk": "sk",
                    "#date": "date",
                    "#costCenter": "costCenter"
                },
                ExpressionAttributeValues: {
                    ":userPK": user.pk,
                    ":sk": `TIME`,
                    ":startDate": startDate,
                    ":endDate": endDate,
                    ":costCenter": costCenter
                }
            };

        }
        //filtered both Cost Center AND Employee
        else if(costCenter !== 'ALL' && employeeId !== ''){
            params = {
                TableName : process.env.AWS_DATABASE,
                KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                FilterExpression: "#date between :startDate and :endDate AND #id = :id AND #costCenter = :costCenter",
                ExpressionAttributeNames:{
                    "#pk": "pk",
                    "#sk": "sk",
                    "#date": "date",
                    "#costCenter": "costCenter",
                    "#id": "id"
                },
                ExpressionAttributeValues: {
                    ":userPK": user.pk,
                    ":sk": `TIME`,
                    ":startDate": startDate,
                    ":endDate": endDate,
                    ":costCenter": costCenter,
                    ":id": employeeId
                }
            };
        }

        const {Items} = await docClient.query(params).promise().catch(error => req.flash('error', error));
        console.log(Items);
        res.send(Items.sort(function (a, b) {
            if(a.date > b.date) return 1;
            if(a.date < b.date) return -1;

            if(a.lastName.toLowerCase() > b.lastName.toLowerCase()) return 1;
            if(a.lastName.toLowerCase() < b.lastName.toLowerCase()) return -1;

        })
        );

    } catch (error) {
        console.log(error);
    }
}

exports.timeRecordsDataUpdate = async (req, res, next) => {
    let user = req.user;
    const {row_id, col_name, col_val} = req.body;

    if(col_name == 'delete'){
        let params = {
            TableName:process.env.AWS_DATABASE,
            Key:{
                "pk": user.pk,
                "sk": row_id
            }
        }

        await docClient.delete(params).promise().catch(error => console.log(error));
        return res.sendStatus(200)
    }else{
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
}

exports.timeRecordsDataExport = async (req, res, next) => {
    function fetchData(employeeId, costCenter, startDate, endDate, user){
        return new Promise(  (resolve, reject) => {
            let params;

            if(employeeId !== '' && costCenter === 'ALL'){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate AND :endDate AND #id = :id",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#id": "id"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":id": employeeId
                    }
                }
            }
            //filtered Cost Center ONLY
            else if(costCenter !== 'ALL' && employeeId === ''){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #costCenter = :costCenter",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#costCenter": "costCenter"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":costCenter": costCenter
                    }
                };
            }
            //filtered both Cost Center AND Employee
            else if(costCenter !== 'ALL' && employeeId !== ''){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #id = :id AND #costCenter = :costCenter",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#costCenter": "costCenter",
                        "#id": "id"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":costCenter": costCenter,
                        ":id": employeeId
                    }
                };
            }
            //no filter
            else if(costCenter === 'ALL' && employeeId === ''){
                params = {
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
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate
                    }
                };
            }

            docClient.query(params, (error, data)=>{
                if(error){
                    reject(error);
                }else{
                    resolve(data.Items.filter(item => item.position === 'worker'));
                }
            });
        });

    }

    function createFileBody(Items){
        let fileBody = '';
        let breaksAggregate = new Map();
        let overTime = new Map();

        return new Promise( (resolve) => {
            
            for(const row of Items){
                const {breakTime, costCenter, date, exported, flatRate, id, pieceOnly, pieces1, pieces2, pieces3, rate1, rate2, rate3} = row;

                let hours = row.hours;
                let hourlyOnly = false;

                
                if(exported == false || exported == 'false'){
                    
                    //Hourly Pay Only
                    if(parseInt(pieces1) <= 0 && parseInt(pieces2) <= 0 && parseInt(pieces3) <= 0){
                        hourlyOnly = true;
                        if(parseFloat(hours) > process.env.OVERTIME_DAY){
                            fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours) - parseFloat(hours - process.env.OVERTIME_DAY), 0, 0, '', 'HR', '');
                        }else{
                            fileBody +=  createFileRow(id, date, costCenter, hours, 0, 0, '', 'HR', '');
                        }
                    }

                    //get OT hours for the day if applies and subtract OT from the hours worked to only calculate regular hours for rest and recovery
                    if(parseFloat(hours) > process.env.OVERTIME_DAY){
                        if(overTime.has(id)){
                            let obj = overTime.get(id);

                            if(moment(date).format('MM/DD/YYYY') > obj.date){
                                obj.date = moment(date).format('MM/DD/YYYY');
                            }
                            if(hourlyOnly){
                                obj.totalRegularHours += parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY)
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                obj.totalRegularHours += workHours - (parseFloat(hours) - process.env.OVERTIME_DAY);
                                
                            }
                            obj.totalHours += parseFloat(hours);
                            obj.overTimeDaily.push({hours: parseFloat(hours) - process.env.OVERTIME_DAY, date});
                            overTime.set(id, obj);
                            hours = parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY);

                        }else{
                            let totalRegularHours = 0;
                            if(hourlyOnly){
                                totalRegularHours = parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY);
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                totalRegularHours = workHours - (parseFloat(hours) - process.env.OVERTIME_DAY);
                            }

                            let obj = {
                                totalHours: parseFloat(hours),
                                totalRegularHours,
                                overTimeDaily: [{
                                    hours: parseFloat(hours) - process.env.OVERTIME_DAY,
                                    date
                                }],
                                costCenter,
                                date: moment(date).format('MM/DD/YYYY')
                            }

                            overTime.set(id, obj);
                            hours = parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY);
                        }
                    }else{
                        if(overTime.has(id)){
                            let obj = overTime.get(id);

                            if(moment(date).format('MM/DD/YYYY') > obj.date){
                                obj.date = moment(date).format('MM/DD/YYYY');
                            }
                            if(hourlyOnly){
                                obj.totalRegularHours += parseFloat(hours);
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                obj.totalRegularHours += parseFloat(workHours);
                            }

                            obj.totalHours += parseFloat(hours);
                            overTime.set(id, obj);
                        }else{
                            let totalRegularHours = 0;
                            if(hourlyOnly){
                                totalRegularHours = parseFloat(hours);
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                totalRegularHours =  workHours;
                            }

                            let obj = {
                                totalHours: parseFloat(hours),
                                totalRegularHours,
                                overTimeDaily: [],
                                costCenter,
                                date: moment(date).format('MM/DD/YYYY')
                            }

                            overTime.set(id, obj);
                        }
                    }

                    //Pieces And Hourly Pay
                    if(parseInt(pieces1) > 0 && parseFloat(rate1) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) ), 0, 0, '', 'HR', '');
                    }else if(parseInt(pieces2) > 0 && parseFloat(rate2) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) ), 0, 0, '', 'HR', '');
                    }else if(parseInt(pieces3) > 0 && parseFloat(rate3) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) ), 0, 0, '', 'HR', '');
                    }
                    
                    //Add user info to breaks aggregate map
                    if(!hourlyOnly){
                        //state 0 = piece Only 1 = piece and hourly
                        if(pieceOnly == 'true' || pieceOnly == true ){
                            //if user already exist then we just need to update the date and the totals for the hours and piece compensation.
                            if(breaksAggregate.has(id)){

                                let obj = breaksAggregate.get(id);
                                
                                if(moment(date).format('MM/DD/YYYY') > obj.date){
                                    obj.date = moment(date).format('MM/DD/YYYY');
                                }
                                obj.hours += parseFloat(hours);
                                obj.breakTime += parseFloat(breakTime);
                                
                                let set1Found = false;
                                
                                for(let [index, set] of obj.set1.entries()){
                                    if(parseFloat(set.rate1) == parseFloat(rate1)){
                                        set1Found = true;
                                        obj.set1[index].pieces1=  parseInt(obj.set1[index].pieces1) + parseInt(pieces1);   
                                    }
                                }

                                if(!set1Found){
                                    obj.set1.push({pieces1, rate1});
                                }

                                let set2Found = false;
                                for(let [index, set] of obj.set2.entries()){
                                    if(parseFloat(set.rate2) == parseFloat(rate2)){
                                        set2Found = true;
                                        obj.set1[index].pieces2 = parseInt(obj.set2[index].pieces2) + parseInt(pieces2);   
                                    }
                                }

                                if(!set2Found){
                                    obj.set2.push({pieces2, rate2});
                                }

                                let set3Found = false;
                                for(let [index, set] of obj.set3.entries()){
                                    if(parseFloat(set.rate3) == parseFloat(rate3)){
                                        set3Found = true;
                                        obj.set3[index].pieces3=  parseInt(obj.set3[index].pieces3) + parseInt(pieces3);   
                                    }
                                }

                                if(!set3Found){
                                    obj.set3.push({pieces3, rate3});
                                }

                                breaksAggregate.set(id, obj);

                            }else{

                                let obj = {
                                    state: 0,
                                    date: moment(date).format('MM/DD/YYYY'),
                                    hours: parseFloat(hours),
                                    breakTime: parseFloat(breakTime),
                                    costCenter: costCenter,
                                    set1 : [{pieces1, rate1}],
                                    set2 : [{pieces2, rate2}],
                                    set3 : [{pieces3, rate3}],
                                   
                                }
                                breaksAggregate.set(id, obj);
                            }
                        }else if(pieceOnly == 'false' || pieceOnly == false){
                            if(breaksAggregate.has(id)){
    
                                let obj = breaksAggregate.get(id);
                                if(obj.state === 0){
                                    obj.state = 1;
                                }
                                if(moment(date).format('MM/DD/YYYY') > obj.date){
                                    obj.date = moment(date).format('MM/DD/YYYY');
                                }
                                obj.hours += parseFloat(hours);
                                obj.breakTime += parseFloat(breakTime);

                               let set1Found = false;
                                for(let [index, set] of obj.set1.entries()){
                                    if(parseFloat(set.rate1) == parseFloat(rate1)){
                                        set1Found = true;
                                        obj.set1[index].pieces1 = parseInt(obj.set1[index].pieces1) + parseInt(pieces1);   
                                    }
                                }

                                if(!set1Found){
                                    obj.set1.push({pieces1, rate1});
                                }

                                let set2Found = false;
                                for(let [index, set] of obj.set2.entries()){
                                    if(parseFloat(set.rate2) == parseFloat(rate2)){
                                        set2Found = true;
                                        obj.set2[index].pieces2 = parseInt(obj.set2[index].pieces2) + parseInt(pieces2);   
                                    }
                                }

                                if(!set2Found){
                                    obj.set2.push({pieces2, rate2});
                                }

                                let set3Found = false;
                                for(let [index, set] of obj.set3.entries()){
                                    if(parseFloat(set.rate3) == parseFloat(rate3)){
                                        set3Found = true;
                                        obj.set3[index].pieces3 = parseInt(obj.set3[index].pieces3) + parseInt(pieces3);   
                                    }
                                }

                                if(!set3Found){
                                    obj.set3.push({pieces3, rate3});
                                }

                                breaksAggregate.set(id, obj);
                            }else{

                                let obj = {
                                    state: 1,
                                    date: moment(date).format('MM/DD/YYYY'),
                                    hours: parseFloat(hours),
                                    breakTime: parseFloat(breakTime),
                                    costCenter: costCenter,
                                    set1 : [{pieces1, rate1}],
                                    set2 : [{pieces2, rate2}],
                                    set3 : [{pieces3, rate3}],
                                }
                                breaksAggregate.set(id, obj);
                            }
                        }
                    }
                }
            }

            //Add aggregated break compensations
            for(const [key, value] of breaksAggregate){
                const {hours, breakTime, date, costCenter, state, set1, set2, set3} = value;
                console.log('Hours: ', hours);
                let rate = 0;
                let breakTimeInHours = (breakTime / 60.00);
                let workHours = hours - breakTimeInHours;
                let overTimeFlag = false;

                let pieceCompensation = 0;
                for(let set of set1){
                    pieceCompensation += parseInt(set.pieces1) * parseFloat(set.rate1);
                }

                for(let set of set2){
                    pieceCompensation += parseInt(set.pieces2) * parseFloat(set.rate2);
                }

                for(let set of set3){
                    pieceCompensation += parseInt(set.pieces3) * parseFloat(set.rate3);
                }

                let totalOverTimeHours = 0;
                let overTimeData = overTime.get(key);
                console.log(overTimeData);

                //Calculate total overtime with daily overtime and weekly overtime
                if(overTimeData.overTimeDaily.length > 0){
                    overTimeFlag = true;
                    for(const day of overTimeData.overTimeDaily){
                        totalOverTimeHours += parseFloat(day.hours);
                    }
                }

                if(parseFloat(overTimeData.totalRegularHours) > process.env.OVERTIME_WEEK){
                    overTimeFlag = true;
                    totalOverTimeHours += parseFloat(overTimeData.totalRegularHours) - process.env.OVERTIME_WEEK;
                    workHours = overTimeData.totalRegularHours - (parseFloat(overTimeData.totalRegularHours) - process.env.OVERTIME_WEEK);
                }

                //state 0 = piece Only, 1 = piece and hourly
                if(state === 0){
                    rate = parseFloat(pieceCompensation / workHours);

                }else if(state === 1){
                    if(overTimeFlag){
                        console.log('overtime true')
                        let totalNormalHoursCompensation = parseFloat( parseFloat(workHours) * process.env.MINIMUM_WAGE);
                        let totalOverTimeHoursCompensation = parseFloat(totalOverTimeHours) * (process.env.MINIMUM_WAGE * 1.5);
                        
                        console.log('total overtime comp: ', totalOverTimeHoursCompensation);
                        console.log('total normal hours comp: ', totalNormalHoursCompensation);
                        console.log('total piece comp: ', pieceCompensation);
                        
                        let totalCompensation = totalNormalHoursCompensation + pieceCompensation + totalOverTimeHoursCompensation;
                        console.log('total compensation', totalCompensation);

                        console.log('total normal hours : ', workHours);
                        console.log('total OT hours: ',  totalOverTimeHours);
                        console.log('All hours: ', totalOverTimeHours + workHours);

                        rate = parseFloat( totalCompensation / (workHours + parseFloat(totalOverTimeHours)) );
                    }else{
                        console.log('overtime false')
                        let totalCompensation = parseFloat(pieceCompensation + ( workHours * env.MINIMUM_WAGE) );
                        rate = parseFloat(totalCompensation / workHours);
                    }
                }    
                
                //Pieces Pay Only
                for(let set of set1){
                    if(parseInt(set.pieces1) > 0 && parseFloat(set.rate1) > -1 ){
                        fileBody +=  createFileRow(key , date, costCenter, '', set.pieces1, set.rate1, taskName = '', 'PC', '');
                    }
                }
                for(let set of set2){
                    if(parseInt(set.pieces2) > 0 && parseFloat(set.rate2) > -1 ){
                        fileBody +=  createFileRow(key , date, costCenter, '', set.pieces2, set.rate2, taskName = '', 'PC', '')
                    }
                }
                for(let set of set3){
                    if(parseInt(set.pieces3) > 0 && parseFloat(set.rate3) > -1 ){
                        fileBody +=  createFileRow(key , date, costCenter, '', set.pieces3, set.rate3, taskName = '', 'PC', '')
                    }
                }

                //Rest And Recovery
                fileBody +=  createFileRow(key , date, costCenter, breakTimeInHours, '', '', 'Rest and Recovery', 'HR', rate)     
            }

            //Overtime
            for(const [key, value] of overTime){
                const {totalRegularHours, overTimeDaily, costCenter, date} = value

                //Calculate total overtime with daily overtime and weekly overtime
                for(const day of overTimeDaily){
                    fileBody += createFileRow(key, day.date, costCenter, day.hours, '', '', '', 'OV', '');
                }



                if(parseFloat(totalRegularHours) > process.env.OVERTIME_WEEK){
                    let totalOverTimeHours = parseFloat(totalRegularHours) - process.env.OVERTIME_WEEK;
                    console.log('Total OT Hours: ', totalOverTimeHours);
                    fileBody += createFileRow(key, date, costCenter, totalOverTimeHours, '', '', '', 'OV', '');
                }
            }


            resolve(fileBody);
        });
    }

    function createFileRow(id = '', date = '', costCenter = '', hours = '', pieces = 1, rate = 1, taskName = '', payCode= '  ', tcRate = ''){
        let fileBody = '';
        //unused
        fileBody += '         ';
        //*Employee Id must be 5 characters long
        fileBody += id.padEnd(5, ' ');
        //*Timecard date must be formated as MM/DD/YYYY
        fileBody += moment(date).format('MM/DD/YYYY');
        //unused
        fileBody += '      ';
        //*Cost center code
        fileBody += costCenter.padEnd(20, ' ');
        //unused
        fileBody += '     ';
        //piece Unit Type
        fileBody += '                ';
        //unused
        fileBody += '                                                              ';
        //Hours Worked 8 spaces 
        if(payCode === 'HR' || payCode === 'OV'){
            if(hours < 1){
                fileBody += parseFloat(hours).toPrecision(6); 
            }else{
                fileBody += parseFloat(hours).toPrecision(7);
            } 
        } else { 
            fileBody += '        ';
        }
        //Piece QTY, 10
        if(payCode === 'PC'){
            fileBody += parseInt(pieces).toPrecision(9);
        } else {
            fileBody += '          '
        }
        //Piece Rate 8
        if(payCode === 'PC'){
            if(parseFloat(rate) < 1){
                fileBody += parseFloat(rate).toPrecision(6);
            }else {
                fileBody += parseFloat(rate).toPrecision(7);
            }
        } else {
            fileBody += '        '
        }
        //unused
        fileBody += '             ';
        //Task Name
        fileBody += taskName.padEnd(30, ' ');
        //Pay type
        fileBody += payCode;
        // TC rate 10
        if(tcRate === ''){
            fileBody += '          '
        }else {
            fileBody += tcRate.toPrecision(9);
        }
        //Phase 3
        fileBody += '   ';
        //unsused 12
        fileBody += '            ';
        //Equipment Code 25
        fileBody += '                         ';
        //Implement Code 25
        fileBody += '                         ';
        //Unused 3
        fileBody += '   ';
        //CR/LF
        fileBody += '\n';     
        
        return fileBody;
    }

    function updateExportedRows(data, user){
        return new Promise( (resolve, reject) => {
            for(const row of data){
                let params = {
                    TableName : process.env.AWS_DATABASE,
                    Key:{
                        "pk": user.pk,
                        "sk": row.sk
                    },
                    UpdateExpression: "set #exported = :exported",
                    ExpressionAttributeNames:{
                        "#exported": "exported"
                    },
                    ExpressionAttributeValues: {
                        ":exported": true 
                    },
                    ReturnValues:"UPDATED_NEW"
                };

                docClient.update(params, (error, data)=>{
                    if(error){
                        reject(error)
                    }else{
                        resolve(true);
                    }
                });
            }
        });
    }
    async function main(){
        
        try {
            const {user} = req;
            const {startDate, endDate, costCenter, employeeId} = req.body
            let data = await fetchData(employeeId, costCenter, startDate, endDate, user);
            let fileBody = await createFileBody(data);
            let updated = await updateExportedRows(data, user);

            if(updated){
                let exportFile = `./exports/${startDate}_${endDate+ user.firstName + user.lastName + costCenter}.txt`;
                
                fs.writeFile(exportFile, fileBody, (err) => {
                    if (err) throw err;
                    console.log('The file has been saved!');
                    res.download(exportFile, error => {
                        if(error){
                            res.send(500);
                        }
                        //delete file after it is sent back to the user to free up space
                        else{
                            fs.unlinkSync(exportFile, error => {
                                if(error) throw error;
                            });
                        }
                    });
                });
            }
        } catch (error) {
            console.log(error);   
        }
    }

    main();
}

exports.timeRecordsDataReset = async (req, res, next) => {
    function fetchData(employeeId, costCenter, startDate, endDate, user){
        return new Promise(  (resolve, reject) => {
            let params;

            if(employeeId !== '' && costCenter === 'ALL'){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #id = :id",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#id": "id"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":id": employeeId
                    }
                }
            }
            //filtered Cost Center ONLY
            else if(costCenter !== 'ALL' && employeeId === ''){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #costCenter = :costCenter",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#costCenter": "costCenter"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":costCenter": costCenter
                    }
                };
            }
            //filtered both Cost Center AND Employee
            else if(costCenter !== 'ALL' && employeeId !== ''){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #id = :id AND #costCenter = :costCenter",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#costCenter": "costCenter",
                        "#id": "id"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":costCenter": costCenter,
                        ":id": employeeId
                    }
                };
            }
            //no filter
            else if(costCenter === 'ALL' && employeeId === ''){
                params = {
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
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate
                    }
                };
            }

            docClient.query(params, (error, data)=>{
                if(error){
                    reject(error);
                }else{
                    resolve(data.Items);
                }
            });
        });

    }

    function updateData(data=[], user){
        return new Promise( (resolve, reject) => {
            console.log(data.length);
            for(const row of data){
                const params = {
                    TableName: process.env.AWS_DATABASE,
                    Key:{
                        "pk": user.pk,
                        "sk": row.sk
                    },
                    UpdateExpression: "set exported = :exported",
                    ExpressionAttributeValues:{
                        ":exported":false,
                    },
                    ReturnValues:"UPDATED_NEW"
                };
    
                docClient.update(params).promise().catch(error => reject(error));
            }
            resolve(true);
        });
    }

    async function Main(){
        try {
            const {user} = req;
            const {startDate, endDate, costCenter, employeeId} = req.body
            let data = await fetchData(employeeId, costCenter, startDate, endDate, user);
            let updated = await updateData(data, user);
            if(updated){
                return res.sendStatus(200)
            }
        } catch (error) {
            console.log(error)
            return res.sendStatus(500);
        }
    }
    Main();
}

exports.dailySummaryReport = async (req, res, next) => {

    function fetchData(employeeId, costCenter, startDate, endDate, user){
        return new Promise(  (resolve, reject) => {
            let params;

            if(employeeId !== '' && costCenter === 'ALL'){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #id = :id",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#id": "id"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":id": employeeId
                    }
                }
            }
            //filtered Cost Center ONLY
            else if(costCenter !== 'ALL' && employeeId === ''){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #costCenter = :costCenter",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#costCenter": "costCenter"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":costCenter": costCenter
                    }
                };
            }
            //filtered both Cost Center AND Employee
            else if(costCenter !== 'ALL' && employeeId !== ''){
                params = {
                    TableName : process.env.AWS_DATABASE,
                    KeyConditionExpression: `#pk = :userPK AND begins_with(#sk, :sk)`,
                    FilterExpression: "#date between :startDate and :endDate AND #id = :id AND #costCenter = :costCenter",
                    ExpressionAttributeNames:{
                        "#pk": "pk",
                        "#sk": "sk",
                        "#date": "date",
                        "#costCenter": "costCenter",
                        "#id": "id"
                    },
                    ExpressionAttributeValues: {
                        ":userPK": user.pk,
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate,
                        ":costCenter": costCenter,
                        ":id": employeeId
                    }
                };
            }
            //no filter
            else if(costCenter === 'ALL' && employeeId === ''){
                params = {
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
                        ":sk": `TIME#`,
                        ":startDate": startDate,
                        ":endDate": endDate
                    }
                };
            }

            docClient.query(params, (error, data)=>{
                if(error){
                    reject(error);
                }else{
                    resolve(data.Items);
                }
            });
        });

    }

    function createFileBody(Items){
        let fileBody = 'Date,Id,Name,Cost Center,Time,Piece Qty.,Piece Rate,Pay Code,Rate,Activity \n';
        let breaksAggregate = new Map();
        let overTime = new Map();
        let rows = [];

        return new Promise( (resolve) => {
            
            for(const row of Items){
                const {firstName, lastName, breakTime, costCenter, date, exported, flatRate, id, pieceOnly, pieces1, pieces2, pieces3, rate1, rate2, rate3} = row;

                let hours = row.hours;
                let hourlyOnly = false;

                
                if(exported == false || exported == 'false'){
                    
                    //Hourly Pay Only
                    if(parseInt(pieces1) <= 0 && parseInt(pieces2) <= 0 && parseInt(pieces3) <= 0){
                        hourlyOnly = true;
                        if(parseFloat(hours) > process.env.OVERTIME_DAY){
                            fileBody +=  createFileRow(firstName, lastName, firstName, lastName, id, date, costCenter, parseFloat(hours) - parseFloat(hours - process.env.OVERTIME_DAY), 0, 0, '', 'HR', '');
                        }else{
                            fileBody +=  createFileRow(firstName, lastName, id, date, costCenter, hours, 0, 0, '', 'HR', '');
                        }
                    }

                    //get OT hours for the day if applies and subtract OT from the hours worked to only calculate regular hours for rest and recovery
                    if(parseFloat(hours) > process.env.OVERTIME_DAY){
                        if(overTime.has(id)){
                            let obj = overTime.get(id);

                            if(moment(date).format('MM/DD/YYYY') > obj.date){
                                obj.date = moment(date).format('MM/DD/YYYY');
                            }
                            if(hourlyOnly){
                                obj.totalRegularHours += parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY)
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                obj.totalRegularHours += workHours - (parseFloat(hours) - process.env.OVERTIME_DAY);
                                
                            }
                            obj.totalHours += parseFloat(hours);
                            obj.overTimeDaily.push({hours: parseFloat(hours) - process.env.OVERTIME_DAY, date});
                            overTime.set(id, obj);
                            hours = parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY);

                        }else{
                            let totalRegularHours = 0;
                            if(hourlyOnly){
                                totalRegularHours = parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY);
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                totalRegularHours = workHours - (parseFloat(hours) - process.env.OVERTIME_DAY);
                            }

                            let obj = {
                                totalHours: parseFloat(hours),
                                totalRegularHours,
                                overTimeDaily: [{
                                    hours: parseFloat(hours) - process.env.OVERTIME_DAY,
                                    date
                                }],
                                costCenter,
                                date: moment(date).format('MM/DD/YYYY'),
                                firstName,
                                lastName
                            }

                            overTime.set(id, obj);
                            hours = parseFloat(hours) - (parseFloat(hours) - process.env.OVERTIME_DAY);
                        }
                    }else{
                        if(overTime.has(id)){
                            let obj = overTime.get(id);

                            if(moment(date).format('MM/DD/YYYY') > obj.date){
                                obj.date = moment(date).format('MM/DD/YYYY');
                            }
                            if(hourlyOnly){
                                obj.totalRegularHours += parseFloat(hours);
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                obj.totalRegularHours += parseFloat(workHours);
                            }

                            obj.totalHours += parseFloat(hours);
                            overTime.set(id, obj);
                        }else{
                            let totalRegularHours = 0;
                            if(hourlyOnly){
                                totalRegularHours = parseFloat(hours);
                            }else{
                                let breakTimeInHours = parseFloat(breakTime / 60.00);
                                let workHours = parseFloat(hours) - breakTimeInHours;
                                totalRegularHours =  workHours;
                            }

                            let obj = {
                                totalHours: parseFloat(hours),
                                totalRegularHours,
                                overTimeDaily: [],
                                costCenter,
                                date: moment(date).format('MM/DD/YYYY'),
                                firstName,
                                lastName
                            }

                            overTime.set(id, obj);
                        }
                    }

                    //Pieces And Hourly Pay
                    if(parseInt(pieces1) > 0 && parseFloat(rate1) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        fileBody +=  createFileRow(firstName, lastName, id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) ), 0, 0, '', 'HR', '');
                    }else if(parseInt(pieces2) > 0 && parseFloat(rate2) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        fileBody +=  createFileRow(firstName, lastName, id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) ), 0, 0, '', 'HR', '');
                    }else if(parseInt(pieces3) > 0 && parseFloat(rate3) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        fileBody +=  createFileRow(firstName, lastName, id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) ), 0, 0, '', 'HR', '');
                    }
                    
                    //Add user info to breaks aggregate map
                    if(!hourlyOnly){
                        //state 0 = piece Only 1 = piece and hourly
                        if(pieceOnly == 'true' || pieceOnly == true ){
                            //if user already exist then we just need to update the date and the totals for the hours and piece compensation.
                            if(breaksAggregate.has(id)){

                                let obj = breaksAggregate.get(id);
                                
                                if(moment(date).format('MM/DD/YYYY') > obj.date){
                                    obj.date = moment(date).format('MM/DD/YYYY');
                                }
                                obj.hours += parseFloat(hours);
                                obj.breakTime += parseFloat(breakTime);
                                
                                let set1Found = false;
                                
                                for(let [index, set] of obj.set1.entries()){
                                    if(parseFloat(set.rate1) == parseFloat(rate1)){
                                        set1Found = true;
                                        obj.set1[index].pieces1=  parseInt(obj.set1[index].pieces1) + parseInt(pieces1);   
                                    }
                                }

                                if(!set1Found){
                                    obj.set1.push({pieces1, rate1});
                                }

                                let set2Found = false;
                                for(let [index, set] of obj.set2.entries()){
                                    if(parseFloat(set.rate2) == parseFloat(rate2)){
                                        set2Found = true;
                                        obj.set1[index].pieces2 = parseInt(obj.set2[index].pieces2) + parseInt(pieces2);   
                                    }
                                }

                                if(!set2Found){
                                    obj.set2.push({pieces2, rate2});
                                }

                                let set3Found = false;
                                for(let [index, set] of obj.set3.entries()){
                                    if(parseFloat(set.rate3) == parseFloat(rate3)){
                                        set3Found = true;
                                        obj.set3[index].pieces3=  parseInt(obj.set3[index].pieces3) + parseInt(pieces3);   
                                    }
                                }

                                if(!set3Found){
                                    obj.set3.push({pieces3, rate3});
                                }

                                breaksAggregate.set(id, obj);

                            }else{

                                let obj = {
                                    state: 0,
                                    date: moment(date).format('MM/DD/YYYY'),
                                    hours: parseFloat(hours),
                                    breakTime: parseFloat(breakTime),
                                    costCenter: costCenter,
                                    set1 : [{pieces1, rate1}],
                                    set2 : [{pieces2, rate2}],
                                    set3 : [{pieces3, rate3}],
                                    firstName,
                                    lastName
                                   
                                }
                                breaksAggregate.set(id, obj);
                            }
                        }else if(pieceOnly == 'false' || pieceOnly == false){
                            if(breaksAggregate.has(id)){
    
                                let obj = breaksAggregate.get(id);
                                if(obj.state === 0){
                                    obj.state = 1;
                                }
                                if(moment(date).format('MM/DD/YYYY') > obj.date){
                                    obj.date = moment(date).format('MM/DD/YYYY');
                                }
                                obj.hours += parseFloat(hours);
                                obj.breakTime += parseFloat(breakTime);

                               let set1Found = false;
                                for(let [index, set] of obj.set1.entries()){
                                    if(parseFloat(set.rate1) == parseFloat(rate1)){
                                        set1Found = true;
                                        obj.set1[index].pieces1 = parseInt(obj.set1[index].pieces1) + parseInt(pieces1);   
                                    }
                                }

                                if(!set1Found){
                                    obj.set1.push({pieces1, rate1});
                                }

                                let set2Found = false;
                                for(let [index, set] of obj.set2.entries()){
                                    if(parseFloat(set.rate2) == parseFloat(rate2)){
                                        set2Found = true;
                                        obj.set2[index].pieces2 = parseInt(obj.set2[index].pieces2) + parseInt(pieces2);   
                                    }
                                }

                                if(!set2Found){
                                    obj.set2.push({pieces2, rate2});
                                }

                                let set3Found = false;
                                for(let [index, set] of obj.set3.entries()){
                                    if(parseFloat(set.rate3) == parseFloat(rate3)){
                                        set3Found = true;
                                        obj.set3[index].pieces3 = parseInt(obj.set3[index].pieces3) + parseInt(pieces3);   
                                    }
                                }

                                if(!set3Found){
                                    obj.set3.push({pieces3, rate3});
                                }

                                breaksAggregate.set(id, obj);
                            }else{

                                let obj = {
                                    state: 1,
                                    date: moment(date).format('MM/DD/YYYY'),
                                    hours: parseFloat(hours),
                                    breakTime: parseFloat(breakTime),
                                    costCenter: costCenter,
                                    set1 : [{pieces1, rate1}],
                                    set2 : [{pieces2, rate2}],
                                    set3 : [{pieces3, rate3}],
                                    firstName,
                                    lastName
                                }
                                breaksAggregate.set(id, obj);
                            }
                        }
                    }
                }
            }

            //Add aggregated break compensations
            for(const [key, value] of breaksAggregate){
                const {firstName, lastName, hours, breakTime, date, costCenter, state, set1, set2, set3} = value;
                console.log('Hours: ', hours);
                let rate = 0;
                let breakTimeInHours = (breakTime / 60.00);
                let workHours = hours - breakTimeInHours;
                let overTimeFlag = false;

                let pieceCompensation = 0;
                for(let set of set1){
                    pieceCompensation += parseInt(set.pieces1) * parseFloat(set.rate1);
                }

                for(let set of set2){
                    pieceCompensation += parseInt(set.pieces2) * parseFloat(set.rate2);
                }

                for(let set of set3){
                    pieceCompensation += parseInt(set.pieces3) * parseFloat(set.rate3);
                }

                let totalOverTimeHours = 0;
                let overTimeData = overTime.get(key);

                //Calculate total overtime with daily overtime and weekly overtime
                if(overTimeData.overTimeDaily.length > 0){
                    overTimeFlag = true;
                    for(const day of overTimeData.overTimeDaily){
                        totalOverTimeHours += parseFloat(day.hours);
                    }
                }

                if(parseFloat(overTimeData.totalRegularHours) > process.env.OVERTIME_WEEK){
                    overTimeFlag = true;
                    totalOverTimeHours += parseFloat(overTimeData.totalRegularHours) - process.env.OVERTIME_WEEK;
                    workHours = overTimeData.totalRegularHours - (parseFloat(overTimeData.totalRegularHours) - process.env.OVERTIME_WEEK);
                }

                //state 0 = piece Only, 1 = piece and hourly
                if(state === 0){
                    rate = parseFloat(pieceCompensation / workHours);

                }else if(state === 1){
                    if(overTimeFlag){
                        console.log('overtime true')
                        let totalNormalHoursCompensation = parseFloat( parseFloat(workHours) * process.env.MINIMUM_WAGE);
                        let totalOverTimeHoursCompensation = parseFloat(totalOverTimeHours) * (process.env.MINIMUM_WAGE * 1.5);
                        
                        console.log('total overtime comp: ', totalOverTimeHoursCompensation);
                        console.log('total normal hours comp: ', totalNormalHoursCompensation);
                        console.log('total piece comp: ', pieceCompensation);
                        
                        let totalCompensation = totalNormalHoursCompensation + pieceCompensation + totalOverTimeHoursCompensation;
                        console.log('total compensation', totalCompensation);

                        console.log('total normal hours : ', workHours);
                        console.log('total OT hours: ',  totalOverTimeHours);
                        console.log('All hours: ', totalOverTimeHours + workHours);

                        rate = parseFloat( totalCompensation / (workHours + parseFloat(totalOverTimeHours)) );
                    }else{
                        console.log('overtime false')
                        let totalCompensation = parseFloat(pieceCompensation + ( workHours * env.MINIMUM_WAGE) );
                        rate = parseFloat(totalCompensation / workHours);
                    }
                }    
                
                //Pieces Pay Only
                for(let set of set1){
                    if(parseInt(set.pieces1) > 0 && parseFloat(set.rate1) > -1 ){
                        fileBody +=  createFileRow(firstName, lastName, key , date, costCenter, '', set.pieces1, set.rate1, taskName = '', 'PC', '');
                    }
                }
                for(let set of set2){
                    if(parseInt(set.pieces2) > 0 && parseFloat(set.rate2) > -1 ){
                        fileBody +=  createFileRow(firstName, lastName, key , date, costCenter, '', set.pieces2, set.rate2, taskName = '', 'PC', '')
                    }
                }
                for(let set of set3){
                    if(parseInt(set.pieces3) > 0 && parseFloat(set.rate3) > -1 ){
                        fileBody +=  createFileRow(firstName, lastName, key , date, costCenter, '', set.pieces3, set.rate3, taskName = '', 'PC', '')
                    }
                }

                //Rest And Recovery
                fileBody +=  createFileRow(firstName, lastName, key , date, costCenter, breakTimeInHours, '', '', 'Rest and Recovery', 'HR', rate)     
            }

            //Overtime
            for(const [key, value] of overTime){
                const {firstName, lastName, totalRegularHours, overTimeDaily, costCenter, date} = value

                //Calculate total overtime with daily overtime and weekly overtime
                for(const day of overTimeDaily){
                    fileBody += createFileRow(firstName, lastName, key, day.date, costCenter, day.hours, '', '', '', 'OV', '');
                }



                if(parseFloat(totalRegularHours) > process.env.OVERTIME_WEEK){
                    let totalOverTimeHours = parseFloat(totalRegularHours) - process.env.OVERTIME_WEEK;
                    console.log('Total OT Hours: ', totalOverTimeHours);
                    fileBody += createFileRow(firstName, lastName, key, date, costCenter, totalOverTimeHours, '', '', '', 'OV', '');
                }
            }


            resolve(fileBody);
        });
    }

    function createFileRow(firstName ='', lastName='', id = '', date = '', costCenter = '', hours = '', pieces = 1, rate = 1, taskName = '', payCode= '  ', tcRate = ''){
        let fileBody = '';

        fileBody += moment(date).format('MM/DD/YYYY')+',';
        fileBody += id+',';
        fileBody += `${lastName} ${firstName},`
        fileBody += costCenter+',';
        if(payCode === 'HR' || payCode === 'OV'){
            if(hours < 1){
                fileBody += parseFloat(hours).toPrecision(6) + ','; 
            }else{
                fileBody += parseFloat(hours).toPrecision(7) + ',';
            } 
        } else {
            fileBody += ',';
        }
        //Piece QTY, 10
        if(payCode === 'PC'){
            fileBody += parseInt(pieces).toPrecision(9) + ',';
        } else{
            fileBody += ','
        }
        //Piece Rate 8
        if(payCode === 'PC'){
            if(parseFloat(rate) < 1){
                fileBody += parseFloat(rate).toPrecision(6) + ',';
            }else {
                fileBody += parseFloat(rate).toPrecision(7) + ',';
            }
        } else{
            fileBody += ',';
        }
       
        //Pay type
        fileBody += payCode+',';
        // TC rate 10
        if(tcRate === ''){
            fileBody += ','
        }else {
            fileBody += tcRate.toPrecision(9) + ',';
        }
        fileBody += taskName+',';
        //CR/LF
        fileBody += '\n';     
        
        return fileBody;
    }
    
    async function Main(){
        try {
            const {user} = req;
            const {startDate, endDate, costCenter, employeeId} = req.body
            let data = await fetchData(employeeId, costCenter, startDate, endDate, user);
            let file = await createFileBody(data);

            fs.writeFile(`./exports/Summary.csv`, file, (err)=>{
                if (err) throw err;
                console.log('The file has been saved!');
                res.download(`./exports/Summary.csv`, error => {
                    if(error){
                        res.send(500);
                    }
                    //delete file after it is sent back to the user to free up space
                    else{
                        fs.unlinkSync(`./exports/Summary.csv`, error => {
                            if(error) throw error;
                        });
                    }
                });
             });
        } catch (error) {
         console.log(error);   
        }
    }
    Main();
}