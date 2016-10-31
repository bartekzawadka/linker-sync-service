/**
 * Created by barte_000 on 2016-10-23.
 */
var fs = require('fs');
var Sequelize = require('sequelize');
var config = require('../../config');
var path = require('path');
var basename  = path.basename(module.filename);

var db = {};

var sequelize = new Sequelize(config.destination.database, config.destination.username, config.destination.password, {
    host: config.destination.host,
    dialect: config.destination.dialect
});

fs
    .readdirSync(__dirname)
    .filter(function(file) {
        return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
    })
    .forEach(function(file) {
        var model = sequelize['import'](path.join(__dirname, file));
        db[model.name] = model;
    });

Object.keys(db).forEach(function(modelName) {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;