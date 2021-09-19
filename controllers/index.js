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
const {asyncCreateFileBody, fetchData, saveExport} = require('../lib/lib');

//default region is different than where the DynamoDb tables are.
const AWS_CONFIG = { 
    "region": "us-west-1",
    "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
    "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY
};

AWS.config.update(AWS_CONFIG);
const docClient = new dynamodb.DocumentClient();

exports.systemAdmin = (req, res, next) => {

    res.render('systemAdmin', {user: req.user});

}

exports.systemAdminData = async (req, res, next) => {
    const {startDate, endDate} = req.query;

    let isoStartDate = new Date(startDate).toISOString();
    let isoEndDate = new Date(endDate).toISOString();

    let params = {
        TableName: process.env.AWS_DATABASE_EXPORTS,
        FilterExpression: `#pk >= :startDate AND #pk <= :endDate`,
        ExpressionAttributeNames: {
            '#pk': 'pk'
        },
        ExpressionAttributeValues: {
            ':startDate': isoStartDate,
            ':endDate': isoEndDate
        }
    };

    try {
        const {Items} = await docClient.scan(params).promise().catch(error => console.log(error));
        let exports = new Map();

        Items.sort(function (a, b) {
            if(a.pk > b.pk) return 1;
            if(a.pk < b.pk) return -1;

            if(a.employeeUserName.toLowerCase() > b.employeeUserName.toLowerCase()) return 1;
            if(a.employeeUserName.toLowerCase() < b.employeeUserName.toLowerCase()) return -1;

        })
        
        res.send(Items);
    } catch (error) {
        console.log(error)
    }
}
exports.admin = (req, res, next) =>{
    res.render('admin', {user:req.user});
}
exports.adminSet = (req, res, next) => {
    let org = req.params.org;
    let user = req.user;
    user['originalPK'] = user.pk;
    user['pk'] = org.replace('_', '#');

    req.login(user, error => {
        if (error) { console.log(error)}
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
        const {crewName, foremanUsername, foremanPassword, foremanFirst, foremanLast, foremanMiddle, growers, jobs, crewNumber} = req.body;

        const employeeId = uuid();
        const crewUUID = uuid();
        const user = req.user;
        const pk = `ORG#${crewUUID}`;

        let growersList = [];
        let costCenters = [];
        let jobsList = [];
        
        if(growers === undefined){
            
        }else if(Array.isArray(growers)){
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

        if(jobs === undefined){
            
        }else if(Array.isArray(jobs)){
            for(let jobSet of jobs){
                let job = jobSet.split(',');  
                
                let set = {jobName: job[0].replace(/_/g, ' '), jobId: job[1]};
                jobsList.push(set);

            }
        }else{
            let job = jobs.split(',');

            let set = {jobName: job[0].replace(/_/g, ' '), jobId: job[1]};
            jobsList.push(set);
        }

        const orgListNewCrew = {
            growers: growersList, 
            jobs: jobsList,
            name: crewName, 
            number: crewNumber,
            org: pk,
            dateCreated: new Date().toISOString(),
            status: 'active'
        };

        const newCrew = {
            costCenters,
            jobs: jobsList,
            name: crewName,
            number: crewNumber,
            account: user.pk,
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
                        crew: crewName,
                        username: foremanUsername,
                        account: user.pk
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
exports.editAccount = (req, res, next) => {
    res.render('editAccount', {user:req.user});

}
exports.editAccountsPost = async (req, res, next)=> {
    try {
        
        //---------------------- Get deleted arrays -------------------
            let deletedGrowers = [];
            let deletedJobs = [];
    
            let crewsToUpdateGrowers  = [];
            let crewsToUpdateJobs = [];
        
            //loop through user growers and jobs array and see if that grower is in body growers array. If it is push to new array.
            for( const grower of req.user.growers){
                let found = false;
                for(const newGrower of req.body.growers){
                    
                    if(newGrower.growerName === grower.growerName && newGrower.growerId === grower.growerId){
                        found=true;
                    }
                }
                if(!found){
                    deletedGrowers.push(grower);
                }
            }
            if(req.user.jobs){
                for( const job of req.user.jobs){
                    let found = false;
                    for(const newJob of req.body.jobs){
                        
                        if(newJob.jobName === job.jobName && newJob.jobId === job.jobId){
                            found=true;
                        }
                    }
                    if(!found){
                        deletedJobs.push(job);
                    }
                }
            }
    
            //find user crews that need to be updated and remove their grower or jobs from the user's list of crews.
            for(const [crewIndex, crew] of req.user.orgList.entries()){
                let offset = 0;
                let newGrowersList = [...crew.growers];
                for(const [growerIndex, crewGrower] of crew.growers.entries()){
                    for(const deletedGrower of deletedGrowers){
                        if(crewGrower.growerName === deletedGrower.growerName && crewGrower.growerId === deletedGrower.growerId){
                            //see if that crew is already in the array of crews that need to be updated. Since the removal of more than one grower can make duplicated in the crewsToUpdateGrowers array.
                            crewsToUpdateGrowers.push(crew);
                            newGrowersList.splice(growerIndex-offset, 1);
                            offset++;
                        }
                    }
                }
                req.user.orgList[crewIndex].growers = [...newGrowersList];
            }
    
            if(req.user.jobs){
                for(const [crewIndex, crew] of req.user.orgList.entries()){
                    let offset = 0;
                    if(crew.jobs){
                        let newJobsList = [...crew.jobs];
                        for(const [jobIndex, crewJob] of crew.jobs.entries()){
                            for(const deletedJob of deletedJobs){
                                if(crewJob.jobName === deletedJob.jobName && crewJob.jobId === deletedJob.jobId){
                                    //see if that crew is already in the array of crews that need to be updated. Since the removal of more than one grower can make duplicated in the crewsToUpdateGrowers array.
                                    crewsToUpdateJobs.push(crew);
                                    newJobsList.splice(jobIndex-offset, 1);
                                    offset++;
                                }
                            }
                        }
                        req.user.orgList[crewIndex].jobs = [...newJobsList];
                    }
                }
            }
    
        //update the users name, growers and jobs
        req.user['firstName'] = req.body.firstName;
        req.user['lastName'] = req.body.lastName;
        req.user['growers'] = [...req.body.growers];
        req.user['jobs'] = [...req.body.jobs];
    
    
        let params = {
            TableName: process.env.AWS_DATABASE,
            Item:req.user
        }
        
        await docClient.put(params).promise().catch(error => console.log(error));
    
        // update crews that have one of the deleted growers.
        if(crewsToUpdateGrowers.length > 0){
            for(const crew of crewsToUpdateGrowers){
    
                let params = {
                    TableName: process.env.AWS_DATABASE,
                    KeyConditionExpression: "#pk = :pk AND #sk = :sk",
                    ExpressionAttributeNames: {
                        "#pk": "pk",
                        "#sk": "sk"
                    },
                    ExpressionAttributeValues: {
                        ":pk": crew.org,
                        ":sk": "METADATA"
                    }
                };
        
                let update = await docClient.query(params).promise();
                update = update.Items[0];
                let newCostCenters = [...update.costCenters];
    
                //loop through the costCenters of the crew to find the deleted grower
                let offset = 0;
                for(const [index, grower] of update.costCenters.entries()){
                    for(const deletedGrower of deletedGrowers){
                        if(grower.name == deletedGrower.growerName && grower.code == deletedGrower.growerId){
                            //delete grower from crew list
                            newCostCenters.splice(index-offset, 1);
                            offset++;
                        }
                    }
                }
                update['costCenters'] = [...newCostCenters];
                params = {
                    TableName: process.env.AWS_DATABASE,
                    Item: update
                }
    
                await docClient.put(params).promise().catch(error => console.log(error))
            }
        }

        if(crewsToUpdateJobs.length > 0){
            for(const crew of crewsToUpdateJobs){
                let params = {
                    TableName: process.env.AWS_DATABASE,
                    KeyConditionExpression: "#pk = :pk AND #sk = :sk",
                    ExpressionAttributeNames: {
                        "#pk": "pk",
                        "#sk": "sk"
                    },
                    ExpressionAttributeValues: {
                        ":pk": crew.org,
                        ":sk": "METADATA"
                    }
                }

                let update = await docClient.query(params).promise();
                update = update.Items[0];

                let newJobs = [...update.jobs];

                let offset = 0;
                for(const [index, job] of update.jobs.entries()){
                    for(const deletedJob of deletedJobs){
                        if(job.jobName == deletedJob.jobName && job.jobId == deletedJob.jobId){
                            //delete grower from crew list
                            newJobs.splice(index-offset, 1);
                            offset++;
                        }
                    }
                }
                update.jobs = [...newJobs];
                params = {
                    TableName: process.env.AWS_DATABASE,
                    Item: update
                }
    
                await docClient.put(params).promise().catch(error => console.log(error))

            }
        }
    
        req.login(req.user, error => {
            if (error) { return next(error); }
            return res.redirect('/admin/editAccount');
        });
    } catch (error) {
        console.log(error);
    }
}
exports.editCrew = async (req, res, next) => {
    try {
        const {user} = req;

        let params = {
            TableName: process.env.AWS_DATABASE,
            KeyConditionExpression: "#pk = :pk AND #sk = :sk",
            ExpressionAttributeNames: {
                "#pk": "pk",
                "#sk": "sk"
            },
            ExpressionAttributeValues: {
                ":pk": user.pk,
                ":sk": "METADATA"
            }
        }

        let {Items} = await docClient.query(params).promise().catch(error => console.log(error));

        let userGrowers = [];
        let userJobs = [];
        let crewCostCenters = [];
        let crewJobs = [];
        let crew =  Items[0];

        for(let grower of user.growers){
            let flag = true;
            for(let costCenter of crew.costCenters){
                if(grower.growerName === costCenter.name && grower.growerId === costCenter.code){
                    crewCostCenters.push(grower);
                    flag = false
                }
            }
            if(flag){
                userGrowers.push(grower);
            }
        }

        if(crew.jobs){
            for(const job of user.jobs){
                let flag = true;
                for(const crewJob of crew.jobs){
                    if(job.jobName === crewJob.jobName && job.jobId === crewJob.jobId){
                        crewJobs.push(job);
                        flag = false
                    }
                }
                if(flag){
                    userJobs.push(job);
                }
            }
        }else{
            userJobs = [...user.jobs];
        }

        res.render('editCrew', {user: req.user, crew, userGrowers, crewCostCenters, userJobs, crewJobs});
    } catch (error) {
        console.log(error);
    }
};
exports.editCrewPost = async (req, res, next) => {
    try {
        let user = req.user;
        const {name, number, costCenters, jobs} = req.body;

        let newGrowers = []
        let newCostCenters = []
        let newJobs = [];

        if(costCenters === undefined){
            
        }else if(Array.isArray(costCenters)){
            for(let grower of costCenters){
                let splitGrower = grower.split('-');
    
                let newGrower = {
                    growerName: splitGrower[0],
                    growerId: splitGrower[1]
                }
    
                let newCostCenter = {
                    name: splitGrower[0],
                    code: splitGrower[1]
                }
    
                newGrowers.push(newGrower);
                newCostCenters.push(newCostCenter);
            }
        }else{
            let splitGrower = costCenters.split('-');
            let newGrower = {
                growerName: splitGrower[0],
                growerId: splitGrower[1]
            }

            let newCostCenter = {
                name: splitGrower[0],
                code: splitGrower[1]
            }

            newGrowers.push(newGrower);
            newCostCenters.push(newCostCenter);
        }

        if(jobs === undefined){
            
        }else if(Array.isArray(jobs)){
            for(let job of jobs){
                let splitJob = job.split('-');
    
                let newJob = {
                    jobName: splitJob[0],
                    jobId: splitJob[1]
                }
    
                newJobs.push(newJob);
            }
        }else{
            let splitJob = jobs.split('-');
    
            let newJob = {
                jobName: splitJob[0],
                jobId: splitJob[1]
            }

            newJobs.push(newJob);
        }

        //update Crew
        let params = {
            TableName: process.env.AWS_DATABASE,
            KeyConditionExpression: "#pk = :pk AND #sk = :sk",
            ExpressionAttributeNames: {
                "#pk": "pk",
                "#sk": "sk"
            },
            ExpressionAttributeValues: {
                ":pk": user.pk,
                ":sk": "METADATA"
            }
        }
        let {Items} = await docClient.query(params).promise().catch(error => console.log(error));
        let crew = Items[0];

        crew['costCenters'] = [...newCostCenters];
        crew['jobs'] = [...newJobs];
        crew['name'] =  name;
        crew['number'] = number;

        params = {
            TableName: process.env.AWS_DATABASE,
            Item: crew
        }
        await docClient.put(params).promise().catch(e => console.log(e));

        //update orgList for user
        let i = 0;
        for(let [index, org] of user.orgList.entries()){
            if(org.org === user.pk){
                user.orgList[index]['growers'] = [...newGrowers];
                user.orgList[index]['name'] = name;
                user.orgList[index]['number'] = number;
                user.orgList[index]['jobs'] = [...newJobs];
                i=index;
            }
        }   
        let orgPK = user.pk;
        user.pk = user.originalPK;
        delete user['originalPK'];

        params = {
            TableName: process.env.AWS_DATABASE,
            Item: user
        }
        

        await docClient.put(params).promise().catch(e => console.log(e));
        
        user['originalPK'] = user.pk;
        user.pk = orgPK;

        res.redirect('/editCrew');
    } catch (error) {
        console.log(error)
    }
}
exports.getEmployees = async (req, res, next)=>{
    const {user} = req;
    try {
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
        let employees = Items.sort(function (a, b) {
            //first sort by last name
            if(a.lastName > b.lastName){
                return 1;  
            } 
            if(a.lastName < b.lastName){
                return -1;
            } 
            //then sort by first name
            if(a.firstName > b.firstName){
                return 1;
            }
            if(a.firstName < b.firstName) {
                return -1;
            }
            //finally sort by id
            if(parseInt(a.employeeId) > parseInt(b.employeeId)){
                return 1;
            }
            if(parseInt(a.employeeId) < parseInt(b.employeeId)){
                return -1;
            }
    
        });
    
        res.send(employees.filter(e => e.position == 'worker'));
    } catch (error) {
        console.log(error);
    }
}
exports.newEmployee = (req, res, next) => {
    async function Main() {
        try {
                const {employeeId, firstName, middleName, lastName, position, wage} = req.body;
                const {pk} = req.user;
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
                            active: true,
                            wage,
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
                            wage: row[5],
                            sk: `EMP#${uuid()}`
                          };

                          let params = {
                              TableName: process.env.AWS_DATABASE,
                              Item: employee
                          };

                          await docClient.put(params).promise().catch(error => console.log(error));
                    }

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
        await docClient.update(params).promise().catch(error => console.log(error));

        if(col_name == 'employeeId'){
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
            for(let row of Items){

                row.id = col_val;
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

        let Item = await docClient.query(params).promise().catch(error => console.log(error));
        let jobs = Item.Items[0].jobs;
        let costCenters = Item.Items[0].costCenters; 
        
        let employees = Items.sort(function (a, b) {
            //first sort by last name
            if(a.lastName > b.lastName) return 1;
            if(a.lastName < b.lastName) return -1;
            //then sort by first name
            if(a.firstName > b.firstName) return 1;
            if(a.firstName < b.firstName) return -1;
            //finally sort by id
            if(a.employeeId > b.employeeId) return 1;
            if(a.employeeId < b.employeeId) return -1;
        });

        res.render('time', {user, employees: employees.filter(e => e.position == 'worker'), day, costCenters, jobs, message: req.flash('message'), error: req.flash('error')});
    } catch (error) {
        console.log(error);
    }
}
exports.newTime = async (req, res, next) => {
    try {
        const {employees, date, hours, breakTime, costCenter, job, nonProductiveTime, rate1, rate2, rate3} = req.body
        let employeesList = employees;
        typeof date == 'string'? safeDate = date: safeDate=date[0];
        const {user} = req;

        if(employees == undefined){
            req.flash('error', 'No employees were selected')
            res.redirect('/time');
        }else{
            if(typeof employees == 'string'){
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
                const {employeeId, firstName, middleName, lastName, position} = Items[0]
                let wage = 0.00;
                //Individual employee wage rates was introduced after this was written so we there may be employee without a rate. In that case the timecard export will use an environment variable set to the min wage rate.
                if(Items[0].wage){
                    wage = Items[0].wage;
                }

                if(position === 'manager'){
                    params = {
                        TableName: process.env.AWS_DATABASE,
                        Item: {
                            pk: user.pk,
                            sk: `TIME#EMP#${e.substring(4)}#DATE#${date}`,
                            date: moment(date).format('YYYY-MM-DD'),
                            id: employeeId,
                            firstName,
                            middleName,
                            lastName,
                            hours: 0,
                            nonProductiveTime,
                            flatRate: 0,
                            breakTime: 0,
                            pieces1: 0,
                            rate1,
                            pieces2: 0,
                            rate2,
                            pieces3: 0,
                            rate3,
                            job,
                            wage,
                            costCenter,
                            exported: false,
                            pieceOnly: false,
                            position
                        }
                    }
                }else if(position === 'worker'){
                    params = {
                        TableName: process.env.AWS_DATABASE,
                        Item: {
                            pk: user.pk,
                            sk: `TIME#EMP#${e.substring(4)}#DATE#${date}`,
                            date: moment(date).format('YYYY-MM-DD'),
                            id: employeeId,
                            firstName,
                            middleName,
                            lastName,
                            hours,
                            nonProductiveTime,
                            flatRate: 0,
                            breakTime,
                            pieces1: 0,
                            rate1,
                            pieces2: 0,
                            rate2,
                            pieces3: 0,
                            rate3,
                            costCenter,
                            job,
                            wage,
                            exported: false,
                            pieceOnly: false,
                            position
                        }
                    }
                }
    
                await docClient.put(params).promise().catch(error => console.log("Error Submitting Timecard: ",error))
            }
            req.flash('message', `${date} \n ${employeesList.length} time cards have been submitted for grower ${costCenter}.`)
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
        const {employeeId, costCenter, startDate, endDate} = req.query

        const Items = await fetchData(employeeId, costCenter, startDate, endDate, user);

        res.send(Items.sort(function (a, b) {
            if(a.date > b.date) return 1;
            if(a.date < b.date) return -1;

            if(a.lastName > b.lastName) return 1;
            if(a.lastName < b.lastName) return -1;

            if(a.firstName > b.firstName) return 1;
            if(a.firstName < b.firstName) return -1;

            if(a.employeeId > b.employeeId) return 1;
            if(a.employeeId < b.employeeId) return -1;
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
        
        await docClient.update(params).promise().catch(error => console.log(error));
        return res.sendStatus(200)
    }
}
exports.agstarExport = async (req, res, next) => {
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
            const {startDate, endDate, costCenter, employeeId} = req.body;

            let data = await fetchData(employeeId, costCenter, startDate, endDate, user);
            let fileBody = await asyncCreateFileBody(data, 'AgStar');
            let updated = await updateExportedRows(data, user);
            saveExport(employeeId, costCenter, startDate, endDate, user, data);

            if(updated){
                let exportFile = `./exports/${startDate}_${endDate+ user.firstName + user.lastName + costCenter}.txt`;
                
                fs.writeFile(exportFile, fileBody, (err) => {
                    if (err) throw err;
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
exports.datatechExport = async (req, res, next) => {
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
            const {startDate, endDate, costCenter, employeeId} = req.body;

            let params = {
                TableName: process.env.AWS_DATABASE,
                KeyConditionExpression: '#pk = :pk AND #sk = :sk',
                ExpressionAttributeNames: {
                    "#pk": "pk",
                    "#sk": "sk"
                },
                ExpressionAttributeValues: {
                    ":pk": user.pk,
                    ":sk": 'METADATA'
                }
            };

            const {Items} = await docClient.query(params).promise().catch(error => console.log(error));

            let crewId = Items[0].number;

            let data = await fetchData(employeeId, costCenter, startDate, endDate, user);
            let fileBody = await asyncCreateFileBody(data, 'DataTech', crewId);
            let updated = await updateExportedRows(data, user);
            saveExport(employeeId, costCenter, startDate, endDate, user, data);

            if(updated){
                let exportFile = `./exports/${startDate}_${endDate+ user.firstName + user.lastName + costCenter}.csv`;
                
                fs.writeFile(exportFile, fileBody, (err) => {
                    if (err) throw err;
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
exports.dailySummaryReport = async (req, res, next) => {
    
    async function Main(){
        try {
            const {user} = req;
            const {startDate, endDate, costCenter, employeeId} = req.body
            let data = await fetchData(employeeId, costCenter, startDate, endDate, user);
            let file = await asyncCreateFileBody(data, 'summary');
            saveExport(employeeId, costCenter, startDate, endDate, user, data);

            fs.writeFile(`./exports/Summary.csv`, file, (err)=>{
                if (err) throw err;
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
exports.timeRecordsDataReset = async (req, res, next) => {

    function updateData(data=[], user){
        return new Promise( (resolve, reject) => {
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