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
    winston.log('error', 'MongoDB Connection Error. Please make sure that MongoDB is running.');
    winston.log('error', err);
    running = false;
});
mongoose.connection.on('open', function () {
    winston.log('info', 'Connected to mongo server.');
    winston.log('info', 'Starting synchronization');

    sync();
});

module.exports.run = function () {
    cron.schedule(config.cron, migrationTask, true);
};

var migrationTask = function () {

    if (running) {
        winston.log('info', 'Synchronization job invoked, but another task is running. Waiting for next CRON opportunity');
        return;
    }

    running = true;
    winston.log('info', 'Synchronization job started');

    destModels.sequelize.sync().then(function () {
        winston.log('info', 'Destination database synced successfully');

        if (mongoose.connection.readyState == 0) {

            mongoose.connect('mongodb://' +
                config.source.username + ':'
                + config.source.password + '@'
                + config.source.host + '/'
                + config.source.database);
        }
    });
};

var markDeletedItems = function (callback) {
    winston.log('info', 'Marking removed items started');

    destModels.issue.findAll({
        attributes: ['sourceId'],
        where:{
            "inactive": false
        }
    }).then(function (result) {
        var itemsMarkedCount = 0;
        async.each(result, function (item, localCallback) {
            sourceIssue.findById(item.sourceId, function (err, issue) {
                if (err) {
                    localCallback(err);
                    return;
                }

                if (!issue) {
                    destModels.issue.update({
                            "inactive": true
                        }, {
                            where: {
                                "sourceId": item.sourceId
                            }
                        }).then(function () {
                        itemsMarkedCount++;
                        localCallback();
                    }).catch(function (e) {
                        localCallback(e);
                    });
                }else{
                    localCallback();
                }
            });
        }, function (error) {
            winston.log('info', 'Number of items marked as removed: '+itemsMarkedCount);
            callback(error);
        });
    }).catch(function(e){
        callback(e);
    });
};

var sync = function () {

    markDeletedItems(function(er){
        if(er){
            if (er) {
                winston.log('error', 'Marking removed items failed: ' + os.EOL + er);
            }
            mongoose.connection.close();
            running = false;
        }else{
            winston.log('info', 'Marking removed items completed');
            winston.log('info', 'Data synchronization started');

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

                    var itemsInsertedCount = 0;
                    var itemsUpdatedCount = 0;

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
                                            return;
                                        }
                                        itemsInsertedCount++;
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
                                            if (error) {
                                                callback(error);
                                                return;
                                            }
                                            callback();
                                        });
                                    });
                                });
                            }
                        });
                    }, function (error) {
                        if (error) {
                            winston.log('error', 'Synchronization failed: ' + os.EOL + error);
                        }else{
                            winston.log('info', 'Synchronization successfully finished');
                        }
                        winston.log('info', 'Number of items added: '+itemsInsertedCount);
                        winston.log('info', 'Number of items updated: '+itemsUpdatedCount);
                        mongoose.connection.close();
                        running = false;
                    });
                });
            }).catch(function (error) {
                if (error) {
                    winston.log('error', 'Synchronization failed: ' + os.EOL + error);
                }
                mongoose.connection.close();
                running = false;
            });
        }
    });
};