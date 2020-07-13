var express = require('express');
var router = express.Router();
const userCheck = require('../middleware/loggedin')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {error: req.flash('error')});
});

router.get('/new-employee',userCheck, function(req, res, next) {
  res.render('new-employee', {user:req.user});
});

router.get('/time', userCheck, function(req, res, next) {
  res.render('time', {user:req.user});
});

router.get('/records', userCheck,function(req, res, next) {
  res.render('records', {user:req.user});
});
module.exports = router;
