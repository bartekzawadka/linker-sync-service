/**
 * Created by barte_000 on 2016-10-23.
 */
var mongoose = require('mongoose');
var config = require('../../config');

var userSchema = mongoose.Schema({
    username: {type: String, required: true},
    fullName: {type: String, required: true},
    password: {type: String, required: true}
}, {collection: "Users"});

var User = mongoose.model('User', userSchema);
module.exports = User;
