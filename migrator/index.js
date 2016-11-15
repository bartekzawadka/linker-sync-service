/**
 * Created by barte_000 on 2016-10-30.
 */
var destModels = require('../models/dest');
var sourceIssue = require('../models/source/issue');
var logsModels = require('../models/logs');
var mongoose = require('mongoose');
var config = require('../config');
var cron = require('node-cron');
var winston = require('winston');
var os = require('os');
var async = require('async');
var consts = require('./consts');

var running = false;
var currentLogSession = null;
var sessionLevel = 0;
var totalItemsProcessed = 0;

mongoose.connection.on('error', function (err) {

    winston.log('error', 'MongoDB Connection Error. Please make sure that MongoDB is running.');
    winston.log('error', err);
    running = false;
});
mongoose.connection.on('open', function () {
    sync();
});

module.exports.run = function () {
    logsModels.sequelize.sync().then(function(){
        cron.schedule(config.cron, migrationTask, true);
    }).catch(function(e){
        winston.log('error', 'Unable to sync logs database schema:'+os.EOL+e);
    });
};

var getValueForLevel = function(value){
    if(value == "INFO")
        return 0;
    if(value == "DEBUG")
        return 1;
    if(value == "WARNING")
        return 2;
    if(value == "ERROR")
        return 3;
    if(value == "FATAL")
        return 4;

    return 0;
};
var getLevelForValue = function(level){
    if(level == 1)
        return "DEBUG";
    if(level == 2)
        return "WARNING";
    if(level == 3)
        return "ERROR";
    if(level == 4)
        return "FATAL";
    return "INFO";
};

var insertLog = function(level, type, message, description, value, callback){

    var insertLogWithSession = function(logSession, level, type, message, description){
        if(!level){
            winston.log('error', 'Could not add log record: Log level was not provided');
            return;
        }
        if(!type){
            winston.log('error', 'Could not add log record: Log type was not provided');
            return;
        }
        if(!message){
            winston.log('error', 'Could not add log record: Log message was not provided');
            return;
        }

        var insertRecord = {
            sessionId: currentLogSession,
            level: level,
            type: type,
            message: message,
            description: description,
            value: value
        };

        logsModels.log.create(insertRecord).then(function(){
            var currentLevelValue = getValueForLevel(level);
            if(currentLevelValue > sessionLevel)
                sessionLevel = currentLevelValue;

            if(value)
                totalItemsProcessed += value;

            if(callback)
                callback();
        }).catch(function(e){
            var msg = 'Error occurred adding log record:'+os.EOL+e;
            if(description){
                msg += os.EOL+'Message to be written: '+description;
            }
            winston.log('error', msg);
            if(callback)
                callback(e);
        })
    };

    if(!currentLogSession){
        logsModels.session.create({
            startedAt: new Date()
        }).then(function(session){
            currentLogSession = session.id;
            insertLogWithSession(currentLogSession, level, type, message, description);
        });
    }else{
        insertLogWithSession(currentLogSession, level, type, message, description);
    }

};

var migrationTask = function () {

    if (running) {
        return;
    }

    running = true;

    totalItemsProcessed = 0;
    sessionLevel = 0;

    logsModels.session.create({
        startedAt: new Date()
    }).then(function(session){
        currentLogSession = session.id;

        insertLog(consts.LEVEL_INFO, consts.TYPE_SYNC_START, 'Synchronization job started');

        destModels.sequelize.sync().then(function () {
            insertLog(consts.LEVEL_INFO, consts.TYPE_DB_CONNECTION, 'Destination database synced successfully');

            if (mongoose.connection.readyState == 0) {

                mongoose.connect('mongodb://' +
                    config.source.username + ':'
                    + config.source.password + '@'
                    + config.source.host + '/'
                    + config.source.database);
            }
        }).catch(function(e){
            insertLog(consts.LEVEL_FATAL, consts.TYPE_DB_CONNECTION, 'Destination database sync/connection failed', e);
            close();
        });
    });
};

var markDeletedItems = function (callback) {
    insertLog(consts.LEVEL_INFO, consts.TYPE_MARK_REMOVE_START, 'Marking removed items started');

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
                    insertLog(consts.LEVEL_ERROR, consts.TYPE_MARK_REMOVED, 'Unable to find specified issue to mark as removed - \''+item.title+'\'', err);
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
                        insertLog(consts.LEVEL_ERROR, consts.TYPE_MARK_REMOVED, 'Marking removed item as removed failed - \''+item.title+'\'', e);
                        localCallback(e);
                    });
                }else{
                    localCallback();
                }
            });
        }, function (error) {
            if(error){
                insertLog(consts.LEVEL_ERROR, consts.TYPE_MARK_REMOVED, 'Marking issues as removed failed', error);
                callback(true);
                return;
            }
            insertLog(consts.LEVEL_INFO, consts.TYPE_MARK_REMOVED, 'Marking as removed successfully completed');
            insertLog(consts.LEVEL_INFO, consts.TYPE_DELETE_NOTIFICATION, 'Number of items marked as removed: '+itemsMarkedCount, null, itemsMarkedCount);
            callback();
        });
    }).catch(function(e){
        insertLog(consts.LEVEL_ERROR, consts.TYPE_MARK_REMOVED, 'Marking issues as removed failed', e);
        callback(true);
    });
};

var addAndUpdateItems = function(operationFinishedCallback){

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
                insertLog(consts.LEVEL_FATAL, consts.TYPE_SYNC_DATA_FETCH,'Error occured requesting data to synchronize', error );
                operationFinishedCallback(true);
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

                            itemsInsertedCount++;

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
                                    insertLog(consts.LEVEL_ERROR, consts.TYPE_LINK, 'Links adding failed for issue: '+record.title, error);
                                    callback(error);
                                    return;
                                }

                                callback();
                            });
                        }).catch(function(errr){
                            if(errr){
                                insertLog(consts.LEVEL_ERROR, consts.TYPE_ISSUE, 'Issue adding failed - issue: \''+item.title+'\'', errr);
                                callback(errr);
                            }
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
                            }).then(function () {
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
                                        insertLog(consts.LEVEL_ERROR, consts.TYPE_LINK, 'Links update failed for issue: \''+item.title+'\'', error);
                                        callback(error);
                                        return;
                                    }

                                    itemsUpdatedCount++;
                                    callback();
                                });
                            }).catch(function(e){
                                if(e){
                                    insertLog(consts.LEVEL_ERROR, consts.TYPE_ISSUE, 'Issue update failed - issue: \''+item.title+'\'', e);
                                    callback(e);
                                }
                            });
                        });
                    }
                });
            }, function (error) {
                if (error) {
                    insertLog(consts.LEVEL_ERROR, consts.TYPE_INSERT_UPDATE, 'New/modified objects synchronization failed', error);
                    operationFinishedCallback(true);
                    return;
                }

                insertLog(consts.LEVEL_INFO, consts.TYPE_INSERT_UPDATE, 'All items added and updated successfully');
                insertLog(consts.LEVEL_INFO, consts.TYPE_INSERT_NOTIFICATION, 'Number of items added: '+itemsInsertedCount, null, itemsInsertedCount);
                insertLog(consts.LEVEL_INFO, consts.TYPE_UPDATE_NOTIFICATION, 'Number of items updated: '+itemsUpdatedCount, null, itemsUpdatedCount);
                operationFinishedCallback();
            });
        });
    }).catch(function (error) {
        insertLog(consts.LEVEL_ERROR, consts.TYPE_INSERT_UPDATE, 'New/modified objects synchronization failed', error);
        operationFinishedCallback(true);
    });
};

var close = function(success){
    try{
        mongoose.connection.close();
        //var level = consts.LEVEL_ERROR;
        var message = 'Synchronization failed';
        if(success && success == true) {
            //level = consts.LEVEL_INFO;
            message = 'Synchronization successfully completed';
        }

        var level = getLevelForValue(sessionLevel);

        insertLog(level, consts.TYPE_SYNC_END, message, null, null, function(er){
            if(er){
                return;
            }

            logsModels.session.findById(currentLogSession).then(function(result){
                if(result){
                    result.updateAttributes({
                        endedAt: new Date(),
                        level: level,
                        processedItemsCount: totalItemsProcessed
                    }).then(function(r){
                        running = false;
                    }).catch(function(e){
                        winston.log('error', 'Closing logging session {'+currentLogSession+'} failed: '+os.EOL+e);
                        running = false;
                    });
                }
            }).catch(function(e){
                winston.log('error', 'Closing logging session {'+currentLogSession+'} failed - unable to find current session: '+os.EOL+e);
                running = false;
            });
        });
    }catch(e) {
        running = false
    }
};

var sync = function () {

    addAndUpdateItems(function(error){
        if(error && error == true){
            close();
            return;
        }

        markDeletedItems(function(er){
            if(er && er == true){
                close();
            }else{
                close(true);
            }
        })

    });
};