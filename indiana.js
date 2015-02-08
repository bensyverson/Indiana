#!/usr/bin/env node
"use strict";
var println = function(arg) { console.log(arg); };

var fs = require('fs');
var Iterator = require('./iterator.js');
var IndianaConverter = require('./converter.js');


var inDir = null;

for (var i = 0; i < process.argv.length; i++) {
	inDir = process.argv[i];
}


var aConverter = new IndianaConverter();
aConverter.forceReplace = true;

var anIterator = new Iterator(function(file) {
	return (file.match(/\.py$/i));
}, function(path) { 
	aConverter.convert(path); 
});


return anIterator.iterate(inDir);

