const dynamodb = require('aws-sdk/clients/dynamodb');
const docClient = new dynamodb.DocumentClient();
const moment = require('moment');


exports.asyncCreateFileBody = (rows, type) => {
    let fileBody = ''
    if(type === 'summary'){
        fileBody = 'Id,Date,Cost Center,Unit Type,Hours,Pieces,Rate,Task Name,Pay Code,Pay Rate\n';
    }

    let breaksAggregate = new Map();
    let overTime = new Map();

    console.log(rows.length);
    console.log(type);

    function createFileRow(id = '', date = '', costCenter = '', hours = '', pieces = 1, rate = 1, taskName = '', payCode= '  ', tcRate = '', type = ''){
        if(type === ''){
            return '';
        }
        else if(type === "AgStar"){
            return createFileRowAgStar(id, date, costCenter, hours, pieces = 1, rate = 1, taskName, payCode, tcRate);
        }else if(type === "summary"){
            return createFileRowSummary(id, date, costCenter, hours, pieces = 1, rate = 1, taskName, payCode, tcRate);
        }
    }
    
    function createFileRowAgStar(id = '', date = '', costCenter = '', hours = '', pieces = 1, rate = 1, taskName = '', payCode= '  ', tcRate = ''){
        let fileBody = '';
        //unused
        fileBody += '         ';
        //*Employee Id must be 5 characters long
        fileBody += id.padEnd(5, ' ');
        //*Timecard date must be formatted as MM/DD/YYYY
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
        // if(payCode === 'HR' || payCode === 'OV' || payCode === 'PC'){
            if( hours === 0){
                fileBody += '        ';
            }
            else if(hours < 1){
                console.log('hours in add row: ', hours);
                fileBody += parseFloat(hours).toPrecision(6); 
            }else{
                fileBody += parseFloat(hours).toPrecision(7);
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

    function createFileRowSummary(id = '', date = '', costCenter = '', hours = '', pieces = 1, rate = 1, taskName = '', payCode= '  ', tcRate = ''){
        let fileBody = '';
        //*Employee Id must be 5 characters long
        fileBody += id+',';
        //*Timecard date must be formatted as MM/DD/YYYY
        fileBody += moment(date).format('MM/DD/YYYY') + ',';;
        //*Cost center code
        fileBody += costCenter+',';
        //piece Unit Type
        fileBody += ',';
        //Hours Worked 8 spaces 
        // if(payCode === 'HR' || payCode === 'OV' || payCode === 'PC'){
            if( hours === 0){
                fileBody += ',';
            }
            else if(hours < 1){
                fileBody += parseFloat(hours).toPrecision(6) + ','; 
            }else{
                fileBody += parseFloat(hours).toPrecision(7)+ ',';
            } 
        //Piece QTY, 10
        if(payCode === 'PC'){
            fileBody += parseInt(pieces).toPrecision(9)+ ',';
        } else {
            fileBody += ','
        }
        //Piece Rate 8
        if(payCode === 'PC'){
            if(parseFloat(rate) < 1){
                fileBody += parseFloat(rate).toPrecision(6)+ ',';
            }else {
                fileBody += parseFloat(rate).toPrecision(7)+ ',';
            }
        } else {
            fileBody += ','
        }
        //Task Name
        fileBody += taskName + ',';
        //Pay type
        fileBody += payCode+ ',';
        // TC rate 10
        if(tcRate === ''){
            fileBody += ','
        }else {
            fileBody += tcRate.toPrecision(9);
        }
        //Phase 3
        // fileBody += ',';
        //Equipment Code 25
        // fileBody += ',';
        //Implement Code 25
        // fileBody += ',';
        //CR/LF
        fileBody += '\n';     
        
        return fileBody;
    }

    return new Promise( (resolve) => {
        
        for(const row of rows){
            const {breakTime, nonProductiveTime, costCenter, job, date, exported, id, pieceOnly, pieces1, pieces2, pieces3, rate1, rate2, rate3} = row;

            let hours = row.hours;
            let hourlyOnly = false;
            console.log(type);

            
            if(exported == false || exported == 'false'){
                
                //Hourly Pay Only
                if(parseInt(pieces1) <= 0 && parseInt(pieces2) <= 0 && parseInt(pieces3) <= 0){
                    hourlyOnly = true;
                    if(parseFloat(hours) > process.env.OVERTIME_DAY){
                        fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours) - parseFloat(hours - process.env.OVERTIME_DAY), 0, 0, job, 'HR', '', type);
                    }else{
                        fileBody +=  createFileRow(id, date, costCenter, hours, 0, 0, job, 'HR', '' , type);
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
                    fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) - (nonProductiveTime/60) ), 0, 0, job, 'HR', '', type);
                }else if(parseInt(pieces2) > 0 && parseFloat(rate2) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                    fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) - (nonProductiveTime/60) ), 0, 0, job, 'HR', '', type);
                }else if(parseInt(pieces3) > 0 && parseFloat(rate3) > -1 && (pieceOnly == false || pieceOnly == 'false')){
                    fileBody +=  createFileRow(id, date, costCenter, parseFloat(hours - ( parseFloat(breakTime) / 60) - (nonProductiveTime/60) ), 0, 0, job, 'HR', '', type);
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
                                nonProductiveTime,
                                job,
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
                                nonProductiveTime,
                                job,
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
            const {hours, breakTime, nonProductiveTime, job, date, costCenter, state, set1, set2, set3} = value;
            let rate = 0;
            let breakTimeInHours = (breakTime / 60.00);
            let nonProductiveTimeInHours = (nonProductiveTime/60);
            let adjustedWorkHours = hours - breakTimeInHours - nonProductiveTimeInHours;
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
            // console.log(overTimeData);

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
                //overtime total regular hours is the totals hours - break time. For piece only and piece and hourly we also need to subtract the non prod time
                adjustedWorkHours = overTimeData.totalRegularHours - nonProductiveTimeInHours;
            }
            // console.log(adjustedWorkHours);

            //state 0 = piece Only, 1 = piece and hourly
            if(state === 0){
                rate = parseFloat(pieceCompensation / hours);

            }else if(state === 1){
                if(overTimeFlag){
                    // console.log('overtime true')
                    let totalNormalHoursCompensation = parseFloat( parseFloat(adjustedWorkHours) * process.env.MINIMUM_WAGE);
                    let totalOverTimeHoursCompensation = parseFloat(totalOverTimeHours) * (process.env.MINIMUM_WAGE * 1.5);
                    
                    let totalCompensation = totalNormalHoursCompensation + pieceCompensation + totalOverTimeHoursCompensation;

                    rate = parseFloat( totalCompensation / (hours + parseFloat(totalOverTimeHours)) );
                }else{
                    // console.log('overtime false')
                    let totalCompensation = parseFloat(pieceCompensation + ( adjustedWorkHours * env.MINIMUM_WAGE) );
                    rate = parseFloat(totalCompensation / hours);
                }
            }    
            
            //Pieces Pay Only
            for(let set of set1){
                if(parseInt(set.pieces1) > 0 && parseFloat(set.rate1) > -1 ){
                    // console.log(hours)
                    if(state === 1){
                        fileBody +=  createFileRow(key , date, costCenter, 0 , set.pieces1, set.rate1, job, 'PC', '' , type);
                        fileBody +=  createFileRow(key , date, costCenter, nonProductiveTimeInHours , 0,0, 'Non Productive Time', 'HR', 14 , type); 
                    }else if(state === 0){
                        fileBody +=  createFileRow(key , date, costCenter, parseFloat(hours - nonProductiveTimeInHours - breakTimeInHours) , set.pieces1, set.rate1, job, 'PC', '' , type);
                        fileBody +=  createFileRow(key , date, costCenter, nonProductiveTimeInHours , 0, 0, 'Non Productive Time', 'HR', 14 , type); 
                    }
                }
            }
            for(let set of set2){
                if(parseInt(set.pieces2) > 0 && parseFloat(set.rate2) > -1 ){
                    if(state === 1){
                        fileBody +=  createFileRow(key , date, costCenter, 0 , set.pieces2, set.rate2, job, 'PC', '', type);
                        fileBody +=  createFileRow(key , date, costCenter, nonProductiveTimeInHours , 0, 0, 'Non Productive Time', 'HR', 14), type; 
                    }else if(state === 0){
                        fileBody +=  createFileRow(key , date, costCenter, parseFloat(hours - nonProductiveTimeInHours - breakTimeInHours) , set.pieces2, set.rate2, job, 'PC', '' , type);
                        fileBody +=  createFileRow(key , date, costCenter, nonProductiveTimeInHours ,0, 0, 'Non Productive Time', 'HR', 14, type); 
                    }                    
                }
            }
            for(let set of set3){
                if(parseInt(set.pieces3) > 0 && parseFloat(set.rate3) > -1 ){
                    if(state === 1){
                        fileBody +=  createFileRow(key , date, costCenter, 0 , set.pieces3, set.rate3, job, 'PC', '', type);
                        fileBody +=  createFileRow(key , date, costCenter, nonProductiveTimeInHours , 0, 0, 'Non Productive Time', 'HR', 14, type); 
                    }else if(state === 0){
                        fileBody +=  createFileRow(key , date, costCenter, parseFloat(hours - nonProductiveTimeInHours - breakTimeInHours) , set.pieces3, set.rate3, job, 'PC', '', type);
                        fileBody +=  createFileRow(key , date, costCenter, nonProductiveTimeInHours , 0, 0, 'Non Productive Time', 'HR', 14, type); 
                    }                    
                }
            }

            //Rest And Recovery
            fileBody +=  createFileRow(key , date, costCenter, breakTimeInHours, '', '', 'Rest and Recovery', 'HR', rate, type)     
        }

        //Overtime
        for(const [key, value] of overTime){
            const {totalRegularHours, overTimeDaily, costCenter, date} = value

            //Calculate total overtime with daily overtime and weekly overtime
            for(const day of overTimeDaily){
                fileBody += createFileRow(key, day.date, costCenter, day.hours, '', '', '', 'OV', '', type);
            }



            if(parseFloat(totalRegularHours) > process.env.OVERTIME_WEEK){
                let totalOverTimeHours = parseFloat(totalRegularHours) - process.env.OVERTIME_WEEK;
                // console.log('Total OT Hours: ', totalOverTimeHours);
                fileBody += createFileRow(key, date, costCenter, totalOverTimeHours, '', '', '', 'OV', '', type);
            }
        }

        resolve(fileBody);
    });
}

exports.fetchData = (employeeId, costCenter, startDate, endDate, user) => {
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
