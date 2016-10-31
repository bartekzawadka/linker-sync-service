var winston = require('winston');
var migrator = require('./migrator');
var path = require('path');
var config = require('./config');
var fs = require('fs');

if(!fs.existsSync(config.logsDir)){
    fs.mkdirSync(config.logsDir);
}
var fileName = path.join(config.logsDir, 'linker-sync.log');

winston.add(winston.transports.File, {filename: fileName});
winston.remove(winston.transports.Console);

migrator.run();
