"use strict";
var println = function(arg) { console.log(arg); };

var fs = require('fs');


var Iterator = function(filter, operation) {
	this.filter = filter || function(e) { return true };
	this.operation = operation || function(e) { println("Iterating on " + e); }
	this.options = {
		recursive: true,
	};
};

Iterator.prototype.iterate = function(path) {
	var self = this;

	var isDirectory = function(filename){
		var stat = fs.statSync(path + "/" + filename);
		return stat.isDirectory();
	};

	// Does this path exist?
	if (!fs.existsSync(path)) {
		println("Error! Directory '" + path + "' doesn't exist.");
		return 1;
	}

	// Is this path a directory?
	var stats = fs.statSync(path);
	if (!stats.isDirectory()) {
		println("Error! '" + path + "' isn't a directory.");
		return 1;
	}

	// Get the files
	var files = fs.readdirSync(path);

	if (files.length < 1) {
		println("Warning: '" + path + "' contains no files.");
		return;
	}

	// filter the files
	var pythonFiles = files.filter(self.filter);
	var subdirectories = files.filter(isDirectory);

	// Iterate on those files.
	pythonFiles.forEach(function(val, index){
		self.operation(path + "/" + val);
	});

	// Then recurse if we're allowed to.
	if (self.options.recursive) {
		subdirectories.forEach(function(val, index){
			self.iterate(path + "/" + val);
		});
	}
};

module.exports = Iterator;
