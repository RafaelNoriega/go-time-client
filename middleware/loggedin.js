exports.userCheck =  (req,res, next) => {
  if(req.user)
  {
    next();
  }
  else
  {
    console.log('user not authorized')
    res.redirect('/');
  } 
};

exports.userCheckAdmin = (req, res, next) => {
  if(req.user && (req.user.pk.includes("ACC") || req.user.originalPK) )
  {
    next();
  }
  else if(req.user){
    console.log('user not authorized')
    res.redirect('/time');
  }
  else
  {
    console.log('user not authorized')
    res.redirect('/');
  } 
}