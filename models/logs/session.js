module.exports = function(sequelize, DataTypes){
    var session = sequelize.define("session", {
        id: {type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true},
        startedAt: {type: DataTypes.DATE, allowNull: false},
        endedAt: {type: DataTypes.DATE, allowNull: true},
        level: {type: DataTypes.STRING, allowNull: true},
        processedItemsCount: {type: DataTypes.INTEGER, allowNull: true}
    }, {
        classMethods: {
            associate: function (models) {
                session.hasMany(models.log, {foreignKey: {allowNull: false},onDelete: 'CASCADE', onUpdate: 'CASCADE'})
            }
        }
    });

    return session;
};