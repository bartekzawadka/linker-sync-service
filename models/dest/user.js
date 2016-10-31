/**
 * Created by barte_000 on 2015-12-28.
 */
'use strict';

module.exports = function(sequelize, DataTypes){
    return sequelize.define("user", {
        id: {type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true},
        username: {type: DataTypes.STRING(100), allowNull: false},
        fullname: {type: DataTypes.STRING(400), allowNull: false},
        password: {type: DataTypes.STRING(1000), allowNull: false}
    });
};
