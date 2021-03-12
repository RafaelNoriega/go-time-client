const express = require('express');
const router = express.Router();
const {userCheck, userCheckAdmin, userCheckSystemAdmin} = require('../middleware/loggedin');
const controllers = require('../controllers');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {error: req.flash('error')});
});

router.get('/systemAdmin', userCheckSystemAdmin, controllers.systemAdmin);

router.get('/systemAdmin/data', userCheckSystemAdmin, controllers.systemAdminData);

router.get('/admin', userCheckAdmin, controllers.admin);

router.post('/admin/newCrew', userCheckAdmin, controllers.adminNewCrew);

router.get('/admin/deleteCrew/:crew', userCheckAdmin, controllers.adminDeleteCrew);

router.get('/admin/editAccount', userCheckAdmin, controllers.editAccount);

router.post('/admin/editAccount', userCheckAdmin, controllers.editAccountsPost);

router.get('/admin/set/:org', userCheckAdmin, controllers.adminSet);

router.get('/admin/reset', userCheckAdmin, controllers.adminReset);

router.get('/editCrew', userCheck, controllers.editCrew);

router.post('/editCrew', userCheck, controllers.editCrewPost);

router.get('/new-employee',userCheck,(req, res, next) => res.render('new-employee', {user:req.user, error: req.flash('error'), message: req.flash('message')}) );

router.get('/get-employees',userCheck, controllers.getEmployees);

router.post('/get-employees/update', userCheck, controllers.updateEmployee);

router.post('/new-employee', userCheck, controllers.newEmployee);

router.post('/employeeBulkUpload', userCheck, controllers.employeeBulkUpload);

router.get('/time', userCheck, controllers.getTime);

router.post('/time', userCheck, controllers.newTime);

router.get('/records', userCheck, controllers.timeRecords);

router.get('/records/data', userCheck, controllers.timeRecordsData);

router.post('/records/data', userCheck, controllers.timeRecordsDataUpdate);

router.post('/records/data/export/agstar', userCheck, controllers.agstarExport);

router.post('/records/data/export/datatech', userCheck, controllers.datatechExport);

router.post('/records/data/reset' , userCheck, controllers.timeRecordsDataReset);

router.post('/records/summaryReport', userCheck, controllers.dailySummaryReport);

module.exports = router;
