/**
 * Created by barte_000 on 2016-11-02.
 */
module.exports = function(sequelize, DataTypes){
    var log = sequelize.define("log", {
        id: {type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true},
        sessionId: {type: DataTypes.INTEGER, allowNull: false},
        level: {type: DataTypes.STRING, allowNull: false},
        type: {type: DataTypes.STRING, allowNull: false},
        message: {type: DataTypes.STRING, allowNull: false},
        description: {type: DataTypes.STRING, allowNull: true}
    });

    return log;
};