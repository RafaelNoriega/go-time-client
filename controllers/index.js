const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const uuid = require('uuid/v1');
const moment = require('moment');
const fs = require('fs');
const { KeyObject } = require('crypto');
const { env } = require('process');

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
                const {employeeId, firstName, middleName, lastName, position} = req.body;
                const {pk, groupId, ranch} = req.user;
                let params;
    
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

exports.getTime = async (req, res, next) => {
    try {
        const {user} = req;
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
        res.render('time', {user, employees:Items, day, costCenters, message: req.flash('message'), error: req.flash('error')});
    } catch (error) {
        
    }
}

exports.newTime = async (req, res, next) => {
    try {
        const {employees, date, hours, breakTime, costCenter} = req.body
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

                if(Items[0].position === 'manager'){
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
                            hours: 0,
                            flatRate: 0,
                            breakTime: 0,
                            pieces1: 0,
                            rate1: 0,
                            pieces2: 0,
                            rate2: 0,
                            pieces3: 0,
                            rate3: 0,
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
                            sk: `TIME#${user.groupId}#DATE#${date}#EMP#${e.substring(4)}`,
                            date: moment(date).format('YYYY-MM-DD'),
                            id: Items[0].employeeId,
                            firstName: Items[0].firstName,
                            middleName: Items[0].middleName,
                            lastName: Items[0].lastName,
                            hours,
                            flatRate: 0,
                            breakTime,
                            pieces1: 0,
                            rate1: 0,
                            pieces2: 0,
                            rate2: 0,
                            pieces3: 0,
                            rate3: 0,
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

        res.render('records', {user, startDate, endDate})
   
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
                    ":sk": `TIME#${user.groupId}`,
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
        let breaksAggregate = new Map();

        return new Promise( (resolve, reject) => {
            console.log(Items.length)
            for(const row of Items){
                const {breakTime, costCenter, date, exported, flatRate, hours, id, pieceOnly, pieces1, pieces2, pieces3, rate1, rate2, rate3} = row;
                let hourlyOnly = false;
                if(exported == false || exported == 'false'){
                    // //Flat Rate
                    if(flatRate > 0){

                    }       
                    //Hourly Pay Only
                    if(parseInt(pieces1) <= 0 && parseInt(pieces2) <= 0 && parseInt(pieces3) <= 0){
                        hourlyOnly = true;
                        //unused
                        fileBody += '         ';
                        //*Employee Id must be 5 characters long
                        fileBody += id + ' ';
                        //*Timecard date must be formated as MM/DD/YYYY
                        fileBody += moment(date).format('MM/DD/YYYY');
                        //unused
                        fileBody += '      ';
                        //*Cost center code
                        fileBody += costCenter + '              ';
                        //unused
                        fileBody += '     ';
                        //piece Unit Type
                        fileBody += '                ';
                        //unused
                        fileBody += '                                                              ';
                        //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                        fileBody += parseFloat(hours).toPrecision(7);
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

                    //Pieces And Hourly Pay
                    if(parseInt(pieces1) > 0 && parseFloat(rate1) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        //==============================================HOURLY===============================================
                        //unused
                        fileBody += '         ';
                        //*Employee Id must be 5 characters long
                        fileBody += id + ' ';
                        //*Timecard date must be formated as MM/DD/YYYY
                        fileBody += moment(date).format('MM/DD/YYYY');
                        //unused
                        fileBody += '      ';
                        //*Cost center code
                        fileBody += costCenter + '              ';
                        //unused
                        fileBody += '     ';
                        //piece Unit Type
                        fileBody += '                ';
                        //unused
                        fileBody += '                                                              ';
                        //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8)
                        fileBody += parseFloat(hours - ( parseFloat(breakTime) / 60) ).toPrecision(7);
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
                    else if(parseInt(pieces2) > 0 && parseFloat(rate2) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                       //==============================================HOURLY===============================================
                       //unused
                       fileBody += '         ';
                       //*Employee Id must be 5 characters long
                       fileBody += id + ' ';
                       //*Timecard date must be formated as MM/DD/YYYY
                       fileBody += moment(date).format('MM/DD/YYYY');
                       //unused
                       fileBody += '      ';
                       //*Cost center code
                       fileBody += costCenter + '              ';
                       //unused
                       fileBody += '     ';
                       //piece Unit Type
                       fileBody += '                ';
                       //unused
                       fileBody += '                                                              ';
                       //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8)
                       fileBody += parseFloat(hours - ( parseFloat(breakTime) / 60) ).toPrecision(7);
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
                    else if(parseInt(pieces3) > 0 && parseFloat(rate3) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                        //==============================================HOURLY===============================================
                        //unused
                        fileBody += '         ';
                        //*Employee Id must be 5 characters long
                        fileBody += id + ' ';
                        //*Timecard date must be formated as MM/DD/YYYY
                        fileBody += moment(date).format('MM/DD/YYYY');
                        //unused
                        fileBody += '      ';
                        //*Cost center code
                        fileBody += costCenter + '              ';
                        //unused
                        fileBody += '     ';
                        //piece Unit Type
                        fileBody += '                ';
                        //unused
                        fileBody += '                                                              ';
                        //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8)
                        fileBody += parseFloat(hours - ( parseFloat(breakTime) / 60) ).toPrecision(7);
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
                    
                    //Add user info to breaks aggregate map
                    if(!hourlyOnly){
                        //state 0 = piece Only 1 = piece and hourly
                        if(pieceOnly == 'true' || pieceOnly == true ){
                            //if user already exist then we just need to update the date and the totals for the hours and piece compensation.
                            if(breaksAggregate.has(id)){
                                let pieceCompensation = parseInt(pieces1) * parseFloat(rate1);
                                pieceCompensation    += parseInt(pieces2) * parseFloat(rate2);
                                pieceCompensation    += parseInt(pieces3) * parseFloat(rate3);
    
                                let obj = breaksAggregate.get(id);
                                obj.date = moment(date).format('MM/DD/YYYY');
                                obj.hours += parseFloat(hours);
                                obj.pieceCompensation += pieceCompensation;
                                obj.breakTime += parseFloat(breakTime);
                                obj.pieces1 = parseInt(obj.pieces1) + parseInt(pieces1);
                                obj.pieces2 = parseInt(obj.pieces2) + parseInt(pieces2);
                                obj.pieces3 = parseInt(obj.pieces3) + parseInt(pieces3);

                                breaksAggregate.set(id, obj);
                            }else{
                                let pieceCompensation = parseInt(pieces1) * parseFloat(rate1);
                                pieceCompensation    += parseInt(pieces2) * parseFloat(rate2);
                                pieceCompensation    += parseInt(pieces3) * parseFloat(rate3);
    
                                let obj = {
                                    state: 0,
                                    date: moment(date).format('MM/DD/YYYY'),
                                    hours: parseFloat(hours),
                                    pieceCompensation,
                                    breakTime: parseFloat(breakTime),
                                    costCenter: costCenter,
                                    pieces1,
                                    pieces2,
                                    pieces3,
                                    rate1,
                                    rate2,
                                    rate3
                                }
                                breaksAggregate.set(id, obj);
                            }
                        }else if(pieceOnly == 'false' || pieceOnly == false){
                            if(breaksAggregate.has(id)){
                                let pieceCompensation = parseInt(pieces1) * parseFloat(rate1);
                                pieceCompensation    += parseInt(pieces2) * parseFloat(rate2);
                                pieceCompensation    += parseInt(pieces3) * parseFloat(rate3);
    
                                let obj = breaksAggregate.get(id);
                                if(obj.state === 0){
                                    obj.state = 1;
                                }
                                obj.date = moment(date).format('MM/DD/YYYY');
                                obj.hours += parseFloat(hours);
                                obj.pieceCompensation += pieceCompensation;
                                obj.breakTime += parseFloat(breakTime);
                                obj.pieces1 = parseInt(obj.pieces1) + parseInt(pieces1);
                                obj.pieces2 = parseInt(obj.pieces2) + parseInt(pieces2);
                                obj.pieces3 = parseInt(obj.pieces3) + parseInt(pieces3);
  
                                breaksAggregate.set(id, obj);
                            }else{
                                let pieceCompensation = parseInt(pieces1) * parseFloat(rate1);
                                pieceCompensation    += parseInt(pieces2) * parseFloat(rate2);
                                pieceCompensation    += parseInt(pieces3) * parseFloat(rate3);
    
                                let obj = {
                                    state: 1,
                                    date: moment(date).format('MM/DD/YYYY'),
                                    hours: parseFloat(hours),
                                    pieceCompensation,
                                    breakTime: parseFloat(breakTime),
                                    costCenter: costCenter,
                                    pieces1,
                                    pieces2,
                                    pieces3,
                                    rate1,
                                    rate2,
                                    rate3
                                }
    
                                breaksAggregate.set(id, obj);
                            }
                        }
                    }
                }
            }
            //Add aggregated break compensations
            for(const [key, value] of breaksAggregate){
                const {hours, breakTime, date, costCenter, state, pieceCompensation, pieces1, rate1, pieces2, rate2, pieces3, rate3} = value;
                let rate = 0;
                let breakTimeInMinutes = (breakTime / 60.00);
                let workHours = hours - breakTimeInMinutes;

                //state 0 = piece Only 1 = piece and hourly
                if(state === 0){
                    rate = pieceCompensation/ workHours;

                }else if(state === 1){
                    let totalCompensation = pieceCompensation + ( workHours * env.MINIMUM_WAGE)
                    rate = totalCompensation / workHours
                }               

                //Pieces Pay Only
                if(parseInt(pieces1) > 0 && parseFloat(rate1) > -1 ){
                    //===================================Pieces 1 Export Section=======================================
                    //unused
                    fileBody += '         ';
                    //*Employee Id must be 5 characters long
                    fileBody += key + ' ';
                    //*Timecard date must be formated as MM/DD/YYYY
                    fileBody += moment(date).format('MM/DD/YYYY');
                    //unused
                    fileBody += '      ';
                    //*Cost center code
                    fileBody += costCenter + '              ';
                    //unused
                    fileBody += '     ';
                    //piece Unit Type
                    fileBody += '                ';
                    //unused
                    fileBody += '                                                              ';
                    //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                    fileBody += parseFloat(hours - (breakTime/60)).toPrecision(7);
                    //Piece QTY, 10
                    fileBody += parseInt(pieces1).toPrecision(9);
                    //Piece Rate 8
                    if(parseFloat(rate1) < 1){
                        fileBody += parseFloat(rate1).toPrecision(6);
                    }else {
                        fileBody += parseFloat(rate1).toPrecision(7);
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
                    //===================================Pieces 1 Export Section End=======================================
                }
                if(parseInt(pieces2) > 0 && parseFloat(rate2) > -1 ){
                    //unused
                    fileBody += '         ';
                    //*Employee Id must be 5 characters long
                    fileBody += key + ' ';
                    //*Timecard date must be formated as MM/DD/YYYY
                    fileBody += moment(date).format('MM/DD/YYYY');
                    //unused
                    fileBody += '      ';
                    //*Cost center code
                    fileBody += costCenter + '              ';
                    //unused
                    fileBody += '     ';
                    //piece Unit Type
                    fileBody += '                ';
                    //unused
                    fileBody += '                                                              ';
                    //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                    fileBody += parseFloat(hours - (breakTime/60)).toPrecision(7);
                    //Piece QTY, 10
                    fileBody += parseInt(pieces2).toPrecision(9);
                    //Piece Rate 8
                    if(parseFloat(rate2) < 1){
                        fileBody += parseFloat(rate2).toPrecision(6);
                    }else{
                        fileBody += parseFloat(rate2).toPrecision(7);
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
                if(parseInt(pieces3) > 0 && parseFloat(rate3) > -1 ){
                    //unused
                    fileBody += '         ';
                    //*Employee Id must be 5 characters long
                    fileBody += key + ' ';
                    //*Timecard date must be formated as MM/DD/YYYY
                    fileBody += moment(date).format('MM/DD/YYYY');
                    //unused
                    fileBody += '      ';
                    //*Cost center code
                    fileBody += costCenter + '              ';
                    //unused
                    fileBody += '     ';
                    //piece Unit Type
                    fileBody += '                ';
                    //unused
                    fileBody += '                                                              ';
                    //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                    fileBody += parseFloat(hours - (breakTime/60)).toPrecision(7);
                    //Piece QTY, 10
                    fileBody += parseInt(pieces3).toPrecision(9);
                    //Piece Rate 8
                    if(parseFloat(rate3) < 1){
                        fileBody += parseFloat(rate3).toPrecision(6);
                    }else {
                        fileBody += parseFloat(rate3).toPrecision(7);
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

                //unused
                fileBody += '         ';
                //*Employee Id must be 5 characters long
                fileBody += key + ' ';
                //*Timecard date must be formated as MM/DD/YYYY
                fileBody +=  moment(date).format('MM/DD/YYYY');
                //unused
                fileBody += '      ';
                //*Cost center code
                fileBody += costCenter + '              ';
                //unused
                fileBody += '     ';
                //piece Unit Type
                fileBody += '                ';
                //unused
                fileBody += '                                                              ';
                //Hours Worked 8 spaces (. counts as a space so set precision to 7 + '.' = 8) --------------------------------------
                if(breakTimeInMinutes < 1){
                    fileBody += breakTimeInMinutes.toPrecision(6);
                }else{
                    fileBody += breakTimeInMinutes.toPrecision(7);
                }
                //Piece QTY, 10
                fileBody += '          ';
                //Piece Rate 8
                fileBody += '        ';
                //unused 13
                fileBody += '             ';
                //Task Name 30
                fileBody += 'Rest and Recovery             ';
                //Pay type=====================================================================================================================================
                fileBody += 'HR';
                //Pay type=====================================================================================================================================
                // TC rate 10
                fileBody += rate.toPrecision(9);
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