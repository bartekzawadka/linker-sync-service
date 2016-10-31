/**
 * Created by barte_000 on 2015-12-28.
 */
'use strict';

module.exports = function(sequelize, DataTypes){
    var link = sequelize.define("link", {
        id: {type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true},
        link: {type: DataTypes.STRING(500), allowNull: false}
    });

    return link;
};