const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const uuid = require('uuid/v1');
const moment = require('moment');
const fs = require('fs');

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
        //get all employees under this foreman
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
        
        Items.sort((a, b) => (a.lastName > b.lastName) ? 1 : -1)
        res.render('time', {user:req.user, employees:Items, day, costCenters, message: req.flash('message'), error: req.flash('error')});
    } catch (error) {
        
    }
}

exports.newTime = async (req, res, next) => {
    try {
        const {employees, date, hours, breakTime, costCenter} = req.body
        let employeesList = employees;
        console.log(typeof date)
        let safeDate ;
        typeof date == 'string'? safeDate = date: safeDate=date[0];
        const user = req.user;
        if(employees == undefined){
            req.flash('error', 'No employees were selected')
            res.redirect('/time');
        }else{
            if(typeof employees == 'string'){
                console.log('single employee')
                employeesList = [employees];
            }   

            for(let e of employeesList){  
                console.log(e);
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
                console.log(date)
                params = {
                    TableName: process.env.AWS_DATABASE,
                    Item: {
                        pk: user.pk,
                        sk: `TIME#${user.groupId}#DATE#${date}#EMP#${e.substring(4)}`,
                        date: moment(date).format('YYYY-MM-DD'),
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
                        table: 0,
                        costCenter,
                        exported: false
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

        res.render('records', {user, startDate, endDate})
   
    } catch (error) {
        console.log(error);
        res.render(res.render('records', {user, startDate, endDate}));
    }      
}

exports.timeRecordsData = async (req, res, next) => {
    try {
        let user = req.user;
        const {startDate, endDate, costCenter, employeeId} = req.query
        let params;
        console.log('employee id: ', employeeId)
        console.log('Cost Center:', costCenter)

        //filtered employee ONLY
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
                    ":sk": `TIME#${user.groupId}`,
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
                    ":sk": `TIME#${user.groupId}`,
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
                    ":sk": `TIME#${user.groupId}`,
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
                    ":sk": `TIME#${user.groupId}`,
                    ":startDate": startDate,
                    ":endDate": endDate
                }
            };
        }

        const {Items} = await docClient.query(params).promise().catch(error => req.flash('error', error));
        res.send(Items);

    } catch (error) {
        console.log(error);
    }
}

exports.timeRecordsDataUpdate = async (req, res, next) => {
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

exports.timeRecordsDataExport = async (req, res, next) => {
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
                        ":sk": `TIME#${user.groupId}`,
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
                        ":sk": `TIME#${user.groupId}`,
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
                        ":sk": `TIME#${user.groupId}`,
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
                        ":sk": `TIME#${user.groupId}`,
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
        let fileBody = '';

        return new Promise( (resolve, reject) => {
            for(const row of Items){
                let flag = true;
                if(row.exported == false || row.exported == 'false'){
                    if(parseInt(row.pieces1) > 0 && parseFloat(row.rate1) > -1){
                        flag = false;
                        console.log('pieces1')
                        //unused
                        fileBody += '         ';
                        //*Employee Id must be 5 characters long
                        fileBody += row.id + ' ';
                        //*Timecard date must be formated as MM/DD/YYYY
                        fileBody += moment(row.date).format('MM/DD/YYYY');
                        //unused
                        fileBody += '      ';
                        //*Cost center code
                        fileBody += row.costCenter + '              ';
                        //unused
                        fileBody += '     ';
                        //piece Unit Type
                        fileBody += '                ';
                        //unused
                        fileBody += '                                                              ';
                        //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                        hours = parseInt(row.hours) - (parseInt(row.breakTime)/60);
                        fileBody += (hours).toPrecision(7);
                        //Piece QTY, 10
                        if(parseInt(row.pieces1) < 10){
                            fileBody += parseInt(row.pieces1).toPrecision(9);
                        }else if(parseInt(row.pieces1) < 100){
                            fileBody += parseInt(row.pieces1).toPrecision(9);
                        }else if(parseInt(row.pieces1) >= 100){
                            fileBody += parseInt(row.pieces1).toPrecision(9);
                        }
                        //Piece Rate 8
                        if(parseFloat(row.rate1) < 1){
                            fileBody += parseFloat(row.rate1).toPrecision(6);
                        }else if(parseFloat(row.rate1) < 10){
                            fileBody += parseFloat(row.rate1).toPrecision(7);
                        }else if(parseFloat(row.rate1) < 100){
                            fileBody += parseFloat(row.rate1).toPrecision(7);
                        }else if(parseFloat(row.rate1) >= 100){
                            fileBody += parseFloat(row.rate1).toPrecision(7);
                        }
                        //unused
                        fileBody += '             ';
                        //Task Name
                        fileBody += '                              ';
                        //Pay type
                        fileBody += 'PC';
                        // TC rate 10
                        fileBody += '          ';
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
                    }
                    if(parseInt(row.pieces2) > 0 && parseFloat(row.rate2) > -1){
                        flag=false;
                        console.log("peices2")
                        //unused
                        fileBody += '         ';
                        //*Employee Id must be 5 characters long
                        fileBody += row.id + ' ';
                        //*Timecard date must be formated as MM/DD/YYYY
                        fileBody += moment(row.date).format('MM/DD/YYYY');
                        //unused
                        fileBody += '      ';
                        //*Cost center code
                        fileBody += row.costCenter + '              ';
                        //unused
                        fileBody += '     ';
                        //piece Unit Type
                        fileBody += '                ';
                        //unused
                        fileBody += '                                                              ';
                        //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                        hours = parseFloat(row.hours) - (parseFloat(row.breakTime)/60);
                        fileBody += (hours).toPrecision(7);
                        //Piece QTY, 10
                        //Piece QTY, 10
                        if(parseInt(row.pieces2) < 10){
                            fileBody += parseInt(row.pieces2).toPrecision(9);
                        }else if(parseInt(row.pieces2) < 100){
                            fileBody += parseInt(row.pieces2).toPrecision(9);
                        }else if(parseInt(row.pieces2) >= 100){
                            fileBody += parseInt(row.pieces2).toPrecision(9);
                        }
                        //Piece Rate 8
                        if(parseFloat(row.rate2) < 1){
                            fileBody += parseFloat(row.rate2).toPrecision(6);
                        }else if(parseFloat(row.rate2) < 10){
                            fileBody += parseFloat(row.rate2).toPrecision(7);
                        }else if(parseFloat(row.rate2) < 100){
                            fileBody += parseFloat(row.rate2).toPrecision(7);
                        }else if(parseFloat(row.rate2) >= 100){
                            fileBody += parseFloat(row.rate2).toPrecision(7);
                        }
                        //unused
                        fileBody += '             ';
                        //Task Name
                        fileBody += '                              ';
                        //Pay type
                        fileBody += 'PC';
                        // TC rate 10
                        fileBody += '          ';
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
                    }
                    if(parseInt(row.pieces3) > 0 && parseFloat(row.rate3) > -1){
                        flag=false;
                        //unused
                        fileBody += '         ';
                        //*Employee Id must be 5 characters long
                        fileBody += row.id + ' ';
                        //*Timecard date must be formated as MM/DD/YYYY
                        fileBody += moment(row.date).format('MM/DD/YYYY');
                        //unused
                        fileBody += '      ';
                        //*Cost center code
                        fileBody += row.costCenter + '              ';
                        //unused
                        fileBody += '     ';
                        //piece Unit Type
                        fileBody += '                ';
                        //unused
                        fileBody += '                                                              ';
                        //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                        hours = parseFloat(row.hours) - (parseFloat(row.breakTime)/60);
                        fileBody += (hours).toPrecision(7);
                        //Piece QTY, 10
                        if(parseInt(row.pieces3) < 10){
                            fileBody += parseInt(row.pieces3).toPrecision(9);
                        }else if(parseInt(row.pieces3) < 100){
                            fileBody += parseInt(row.pieces3).toPrecision(9);
                        }else if(parseInt(row.pieces3) >= 100){
                            fileBody += parseInt(row.pieces3).toPrecision(9);
                        }
                        //Piece Rate 8
                        if(parseFloat(row.rate3) < 1){
                            fileBody += parseFloat(row.rate3).toPrecision(6);
                        }else if(parseFloat(row.rate3) < 10){
                            fileBody += parseFloat(row.rate3).toPrecision(7);
                        }else if(parseFloat(row.rate3) < 100){
                            fileBody += parseFloat(row.rate3).toPrecision(7);
                        }else if(parseFloat(row.rate3) >= 100){
                            fileBody += parseFloat(row.rate3).toPrecision(7);
                        }
                        //unused
                        fileBody += '             ';
                        //Task Name
                        fileBody += '                              ';
                        //Pay type
                        fileBody += 'PC';
                        // TC rate 10
                        fileBody += '          ';
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
                    }
                    if(flag){
                        //unused
                        fileBody += '         ';
                        //*Employee Id must be 5 characters long
                        fileBody += row.id + ' ';
                        //*Timecard date must be formated as MM/DD/YYYY
                        fileBody += moment(row.date).format('MM/DD/YYYY');
                        //unused
                        fileBody += '      ';
                        //*Cost center code
                        fileBody += row.costCenter + '              ';
                        //unused
                        fileBody += '     ';
                        //piece Unit Type
                        fileBody += '                ';
                        //unused
                        fileBody += '                                                              ';
                        //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                        fileBody += parseInt(row.hours).toPrecision(7);
                        //Piece QTY, 10
                        fileBody += '          ';
                        //Piece Rate
                        fileBody += '        ';
                        //unused
                        fileBody += '             ';
                        //Task Name
                        fileBody += '                              ';
                        //Pay type
                        fileBody += 'HR';
                        // TC rate 10
                        fileBody += '          ';
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
                    }
                }
            }

            resolve(fileBody);
        });
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
            const user = req.user;
            const {startDate, endDate, costCenter, employeeId} = req.body

            let data = await fetchData(employeeId, costCenter, startDate, endDate, user);
            let fileBody = await createFileBody(data);
            let updated = await updateExportedRows(data, user);

            if(updated){
                let exportFile = `./exports/${startDate}_${endDate+ user.firstName + user.lastName + costCenter}.txt`;
                
                fs.writeFile(exportFile, fileBody, (err) => {
                    if (err) throw err;
                    console.log('The file has been saved!');
                    res.download(exportFile);
                    // fs.unlinkSync(exportFile);
                });
            }
        } catch (error) {
            console.log(error);   
        }
    }

    main();
}