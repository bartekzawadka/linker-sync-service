/**
 * Created by barte_000 on 2016-10-30.
 */
var destModels = require('../models/dest');
var sourceIssue = require('../models/source/issue');
var mongoose = require('mongoose');
var config = require('../config');
var cron = require('node-cron');
var winston = require('winston');
var os = require('os');

module.exports.run = function () {
    cron.schedule(config.cron, migrationTask, true);
};

var migrationTask = function () {
    destModels.sequelize.sync().then(function () {
        winston.log('info', 'Destination database synced successfully');

        var mongoconnection = mongoose.connect('mongodb://' +
            config.source.username + ':'
            + config.source.password + '@'
            + config.source.host + '/'
            + config.source.database);

        mongoose.connection.on('error', function (err) {
            winston.log('error', 'MongoDB Connection Error. Please make sure that MongoDB is running.');
            winston.log('error', err);
        });
        mongoose.connection.on('open', function () {
            winston.log('info', 'Connected to mongo server.');
            winston.log('info', 'Starting synchronization');

            destModels.issue.findAll({
                order: "\"updatedAt\" DESC",
                attributes: ['updatedAt'],
                limit: 1
            }).then(function (result) {
                if (!result || !result[0].dataValues || !result[0].dataValues.updatedAt) {
                    winston.log('error', 'Unable to get latest update info from destination database!');
                    return;
                }
                sourceIssue.find().where({"updateAt": {$gt: result[0].dataValues.updatedAt}}).exec(function (error, res) {
                    if (error) {
                        winston.log('error', 'Error occured requesting data to synchronize: ' + os.EOL + error);
                        return;
                    }

                    console.log(JSON.stringify(res));

                    for(var k in res){
                        if(res.hasOwnProperty(k)){
                            destModels.issue.findAll({where: {"title": res[k].title}}).then(function(r){
                                //todo: Implement migration
                                console.log(r);
                            });
                        }
                    }
                });
            });
        });

    });
};