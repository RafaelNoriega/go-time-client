const express = require('express');
const router = express.Router();
const userCheck = require('../middleware/loggedin')
const controllers = require('../controllers');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {error: req.flash('error')});
});

router.get('/new-employee',userCheck,(req, res, next) => res.render('new-employee', {user:req.user, error: req.flash('error'), message: req.flash('message')}) );

router.get('/get-employees',userCheck, controllers.getEmployees);

router.post('/get-employees/update', userCheck, controllers.updateEmployee);

router.post('/new-employee', userCheck, controllers.newEmployee);

router.get('/time', userCheck, controllers.getTime);

router.post('/time', userCheck, controllers.newTime);

router.get('/records', userCheck, controllers.timeRecords);

router.get('/records/data', userCheck, controllers.timeRecordsData);

router.post('/records/data', userCheck, controllers.timeRecordsDataUpdate);

router.post('/records/data/export', userCheck, controllers.timeRecordsDataExport);

module.exports = router;
