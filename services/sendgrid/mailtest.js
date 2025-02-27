const sendEmail = require('./index');

const message = {
  subject: 'Congratulations on being our Super Admin!!',
  text: 'You are now Super Admin at WhitePanda!! Your Password is: 1234',
  html: '<strong>Hello there mate!! You are now Super Admin at WhitePanda!!</strong><br>Your Password is: 1234. <br> You may login when we are ready.',
};
sendEmail.sendEmail('roshan@whitepanda.in', message);
