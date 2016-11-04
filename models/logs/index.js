/**
 * Created by barte_000 on 2016-10-23.
 */
var fs = require('fs');
var Sequelize = require('sequelize');
var config = require('../../config');
var path = require('path');
var basename  = path.basename(module.filename);

var ldb = {};

var sequelize = new Sequelize(config.logs.database, config.logs.username, config.logs.password, {
    host: config.logs.host,
    dialect: config.logs.dialect
});

fs
    .readdirSync(__dirname)
    .filter(function(file) {
        return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
    })
    .forEach(function(file) {
        var model = sequelize['import'](path.join(__dirname, file));
        ldb[model.name] = model;
    });

Object.keys(ldb).forEach(function(modelName) {
    if (ldb[modelName].associate) {
        ldb[modelName].associate(ldb);
    }
});

ldb.sequelize = sequelize;
ldb.Sequelize = Sequelize;

module.exports = ldb;