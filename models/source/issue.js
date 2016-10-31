/**
 * Created by barte_000 on 2016-10-23.
 */
var mongoose = require('mongoose');
var config = require('../../config');

var issueSchema = mongoose.Schema({
    title: {type: String, required: true},
    description:{type: String, default: ''},
    solveDate: {type: Date},
    createdAt:{type: Date, required: true},
    updateAt:{type: Date, required: true},
    links: {type: [String]}
}, {collection: config.source.collection});

var Issue = mongoose.model('Issue', issueSchema);
module.exports = Issue;