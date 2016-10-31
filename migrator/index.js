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
var async = require('async');

var running = false;

mongoose.connection.on('error', function (err) {
    console.log("MongoDB Connection Error. Please make sure that MongoDB is running.");
    winston.log('error', 'MongoDB Connection Error. Please make sure that MongoDB is running.');
    winston.log('error', err);
    running = false;
});
mongoose.connection.on('open', function () {
    console.log("Connected to mongo server");
    winston.log('info', 'Connected to mongo server.');
    winston.log('info', 'Starting synchronization');

    migrate();
});

module.exports.run = function () {
    cron.schedule(config.cron, migrationTask, true);
};

var migrationTask = function () {

    if (running) {
        console.log('Operation running! Need to wait...');
        return;
    }

    running = true;
    console.log('No job at the moment. Taking token.');

    destModels.sequelize.sync().then(function () {
        winston.log('info', 'Destination database synced successfully');

        console.log('State: ' + mongoose.connection.readyState);

        if(mongoose.connection.readyState == 0) {

            mongoose.connect('mongodb://' +
                config.source.username + ':'
                + config.source.password + '@'
                + config.source.host + '/'
                + config.source.database);
        }
    });
};

var migrate = function(){

    destModels.issue.findAll({
        order: "\"updatedAt\" DESC",
        attributes: ['updatedAt'],
        limit: 1
    }).then(function (result) {
        var where = null;

        if (result && result[0] && result[0].dataValues && result[0].dataValues.updatedAt) {
            var date = new Date(result[0].dataValues.updatedAt);
            where = {
                "updateAt": {
                    $gt: date
                }
            };
        }
        sourceIssue.find().where(where).sort({"updateAt": 1}).exec(function (error, res) {
            if (error) {
                winston.log('error', 'Error occured requesting data to synchronize: ' + os.EOL + error);
                mongoose.connection.close();
                running = false;
                return;
            }

            async.each(res, function (item, callback) {
                destModels.issue.findAll({where: {"sourceId": item.id}}).then(function (r) {
                    if (!r || r.length == 0) {
                        destModels.issue.create({
                            title: item.title,
                            description: item.description,
                            solveDate: item.solveDate,
                            sourceId: item.id
                        }).then(function (record) {
                            async.each(item.links, function (linkItem, localCallback) {
                                destModels.link.create({
                                    link: linkItem,
                                    issueId: record.id
                                }).then(function (e) {
                                    localCallback();
                                }).catch(function (e) {
                                    localCallback(e);
                                })
                            }, function (error) {
                                if (error) {
                                    console.log(error);
                                    callback(error);
                                }
                                callback();
                            });
                        });
                    } else if (r.length > 1) {
                        callback();
                    } else if (r.length == 1) {
                        destModels.link.destroy({where: {"\"issueId\"": r[0].id}}).then(function (e) {
                            destModels.issue.upsert({
                                title: item.title,
                                description: item.description,
                                solveDate: item.solveDate,
                                sourceId: item.id,
                                id: r[0].id
                            }).then(function (e) {
                                async.each(item.links, function (linkItem, localCallback) {
                                    destModels.link.create({
                                        link: linkItem,
                                        issueId: r[0].id
                                    }).then(function (e) {
                                        localCallback();
                                    }).catch(function (e) {
                                        localCallback(e);
                                    });
                                }, function (error) {
                                    if (error)
                                        callback(error);
                                    callback();
                                });
                            });
                        });
                    }
                });
            }, function(error){
                if(error){
                    winston.log('error', 'Migration failed: '+os.EOL+error);
                }
                mongoose.connection.close();
                running = false;
            });
        });
    }).catch(function(error){
        if(error){
            winston.log('error', 'Migration failed: '+os.EOL+error);
        }
        mongoose.connection.close();
        running = false;
    });
};