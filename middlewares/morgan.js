// const chalk = require('chalk');
const morgan = require('morgan');

morgan.token('userId', req => (req && req.user && req.user.id ? req.user.id : '-'));
morgan.token('userEmail', req => (req && req.user && req.user.email ? req.user.email : '-'));

const combined = morgan.compile(
  ':userId :userEmail :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :response-time :res[content-length] ":referrer" ":user-agent"',
);

morgan.format('custom', combined);

module.exports = {
  morgan,
};
