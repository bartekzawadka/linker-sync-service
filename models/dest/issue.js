/**
 * Created by barte_000 on 2015-12-28.
 */
'use strict';

module.exports = function(sequelize, DataTypes){
    var issue = sequelize.define("issue", {
        id: {type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true},
        title: {type: DataTypes.STRING, allowNull: false},
        description: {type:
        DataTypes.STRING, allowNull: true},
        //registrationDate: {type: DataTypes.DATE, allowNull: true},
        //modificationDate: {type: DataTypes.DATE, allowNull: true},
        solveDate: {type: DataTypes.DATE, allowNull: true}
    }, {
        classMethods: {
            associate: function (models) {
                issue.hasMany(models.link, {foreignKey: {allowNull: false},onDelete: 'CASCADE', onUpdate: 'CASCADE'})
            }
        }
    });

    return issue;
};