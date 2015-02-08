"use strict";
var println = function(arg) { console.log(arg); };
var fs = require('fs');


var bail = function(error, cb) {
	println(error);
	if (typeof(cb) === typeof(Function)) cb(error, null);
};

var ingestFile = function(path, cb) {
	// Does this path exist?
	if (!fs.existsSync(path)) {
		bail("Error! File '" + path + "' doesn't exist.", cb);
		return;
	}

	// Is this path a directory?
	var stats = fs.statSync(path);
	if (stats.isDirectory()) {
		bail("Error! '" + path + "' is a directory.", cb);
		return;
	} 

	fs.readFile(path, function(err, data) {
		if (err) {
			bail(err);
			return;
		} 
		if (Buffer.isBuffer(data)) {
			var result = data.toString('utf8');
			if (result) {
				cb(null, result);
			} else {
				bail("Can't read '" + path + "'", cb);
			}
		} else {
			bail("No buffer for '" + path + "'", cb);
		}
	});
};


var IndianaConverter = function() {
	this.verbosity = 1;
	this.forceReplace = false;
	this.preserveLineNumbers = false;
};


IndianaConverter.prototype.convert = function(path, cb) {
	var self = this;
	ingestFile(path, function(err, string){
		if (err || (typeof(string) !== typeof(""))) {
			bail(err || "Couldn't get string from ingestFile for '" + path + "' (got " + typeof(string) + " instead)");
			return;
		}

		if (self.verbosity > 3) {
			println ("Got a " + string.length + " char file for '" + path + "'");
		}

		var jsPath = path.replace(/\.py$/i, '.js');

		// Does this path exist?
		if ((fs.existsSync(jsPath)) && (!self.forceReplace)) {
			println("Error! Directory '" + jsPath + "' already exists.");
			return 1;
		}
		var newString = self.pyToJs(string);

		fs.writeFile(jsPath, newString, 'utf8', cb);
	});
};


IndianaConverter.prototype.pyToJs = function(string) {
	var self = this;

	string += "// end \n";

	var append = function(aString, bString) {
		return aString + "\n" + bString ;
	}

	var lines = string.split(/\n/);

	var contexts = [];
	var currentContext = {};
	contexts.push(currentContext);

	var indentLevel = 0;
	var indentIncrement = null;
	var blockQuote = false;
	var lineNumber = 0;
	var classLevel = -1;
	var lhs = null;
	var rhs = null;

	var resolve = function(expr) {
		if (expr == 'new') {
			return '_newVar';
		} else if (typeof(expr) === typeof('')) {
			expr = expr
				.replace(/(\b)is not(\b)/g, "$1!=$2")
				.replace(/(\b)and(\b)/g, "$1&&$2")
				.replace(/(\b)is(\b)/g, "$1==$2")
				.replace(/(\b)or(\b)/g, "$1||$2")
				.replace(/(\b)not(\b)/g, "$1!$2")
				.replace(/(\b)short(\b)/g, "$1shortVar$2")
				.replace(/(\b)None(\b)/g, "$1undefined$2")
				.replace(/(\b)False(\b)/g, "$1false$2")
				.replace(/(\b)True(\b)/g, "$1true$2")
				.replace(/(\b)math(\b)/g, "$1Math$2")
				.replace(/([^=])==\s*undefined/g, '$1=== undefined')
				.replace(/!=\s*undefined/g, '!== undefined')
				.replace(/(\w)\.append\s*\(/g, '$1.push(')
				.replace(/(\w+)\.keys\s*\(\s*\)/g, 'Object.keys($1)')
				.replace(/(\b)type\s*\(/g, '$1typeof(')
				.replace(/(\b)new(\b)/g, '$1_newVar$2')
			;
			return expr;
		}
	};

	var isNew = function(varName) {
		for (var i = 0; i < contexts.length; i++) {
			var context = contexts[i];
			if (varName in context) {
				return false;
			}
		}
		return true;
	};

	var parseArgs = function(argString, ws) {
		var args = argString.split(',');
		var returnArgs = [];
		var statements = [];
		for (var argIndex in args) {
			var arg = args[argIndex];
			arg = arg.replace(/\s/g, '');
			var defaultMatch = /([^=]+)=(.*)/;
			var defaultResults = defaultMatch.exec(arg);
			if (defaultResults) {
				returnArgs.push(defaultResults[1]);
				statements.push('var ' + defaultResults[1] + ' = typeof(' + defaultResults[1] + ") !== 'undefined' ? " + defaultResults[1] + ' : ' + defaultResults[2] + ';'); 
			} else {
				if (arg == 'self') {
					statements.push('var self = this;');
				} else {
					returnArgs.push(arg);
				}
			}
		}

		if (self.preserveLineNumbers) {
			return resolve('(' + returnArgs.join(', ') + ') { ' + statements.join(' '));
		} else {
			return resolve('(' + returnArgs.join(', ') + ") {\n" + ws + statements.join("\n" + ws));
		}
	}

	return lines.map(function(line){
		++lineNumber;

		if (line.replace(/\s*/g, '') == '') {
			return '';
		}

		var ws = line.match(/\s*/)[0];
		var prefix = ws;
		var myIndent = ws.length;
		var indentChar = ws.charAt(0);

		var nextWs = ws;
		for (var i = 0; i < indentIncrement; i++) {
			nextWs += indentChar;
		}

		if (line.match(/^\s*"""/)) {
			var singleLineQuote = /^\s*"""(.*)"""\s*$/;
			var singleMatches = singleLineQuote.exec(line);
			if (singleMatches) {
				return ws + '/*' + singleMatches[1] + '*/';
			} else {
				blockQuote = !blockQuote;

				return line.replace(/^(\s*)"""(.*)/, blockQuote ? "$1/*$2" : "$1*/$2");
			}
		}

		if (line.match(/^\s*#/)) {
			return line.replace(/^(\s*)#(.*)/, "$1//$2"); 
		}

		if (!blockQuote) {
			if (myIndent < indentLevel) {
				var blockDifference = (indentLevel - myIndent) / indentIncrement;
				var baseWs = prefix;

				for (var i = 0; i < blockDifference; i++) {
					contexts.pop();
					prefix += '} ' ; 
				}

				if (!self.preserveLineNumbers) {
					prefix = '';
					var anIndent = indentLevel;
					while (anIndent > myIndent) {
						anIndent -= indentIncrement;
						for (var j = 0; j < anIndent; j++) {
							prefix += indentChar;
						}
						prefix += "}\n";
					}
					prefix += baseWs;
				}

				if (classLevel >= myIndent) {
					println("Class level: " + classLevel + "myIndent: " + myIndent);
					classLevel = -1;
				}
			} else if (myIndent > indentLevel) {
				if (!indentIncrement) {
					indentIncrement = myIndent;
				}
				var aContext = {};
				currentContext = aContext;
				contexts.push(aContext);
			}
			indentLevel = myIndent;
			// line = indentLevel + " " + line;//println(indentLevel + line);
		}

		var varSet 		= /^\s*([a-z0-9_-]+)\s*=\s*(.*)/i;
		var ifSet		= /^\s*if\s+(.*):\s*(#.*)?/i;
		var elseSet		= /^\s*else\s*:\s*(#.*)?/i;
		var elifSet		= /^\s*elif\s+(.*):\s*(#.*)?/i;
		var forSet		= /^\s*for\s+(.*):\s*(#.*)?/i;

		var defSet		= /^\s*def\s+([a-z0-9_]+)\s*\((.*)\)\s*:\s*(#.*)?/i;

		var classSet	= /^\s*class\s+([a-z0-9_]+)\s*\((.*)\)\s*:\s*(#.*)?/i;

		var trySet		= /^\s*try\s*:\s*(#.*)?/i;
		var exceptSet	= /^\s*except\s*(.*)?:\s*(#.*)?/i;


		var varResults = varSet.exec(line);
		if (varResults) {
			lhs = resolve(varResults[1]);
			rhs = varResults[2];

			if (isNew(lhs)) {
				currentContext[lhs] = true;
				return prefix + "var " + resolve(lhs) + " = " + resolve(rhs) + ";";
			} else {
				return prefix + resolve(lhs) + " = " + resolve(rhs) + ";";
			}
		}

		var ifResults = ifSet.exec(line);
		if (ifResults) {
			return prefix + 'if (' + resolve(ifResults[1]) + ') {' + (ifResults[2] ? ('//' + ifResults[2]) : '');
		}

		var elseResults = elseSet.exec(line);
		if (elseResults) {
			return prefix + 'else {' + (resolve(elseResults[1]) ? ('//' + elseResults[1]) : '');
		}

		var elifResults = elifSet.exec(line);
		if (elifResults) {
			return prefix + 'else if (' + resolve(elifResults[1]) + ') {' + (elifResults[2] ? ('//' + elifResults[2]) : '');
		}

		var forResults = forSet.exec(line);
		if (forResults) {
			var forArgs = forResults[1];
			var inMatch = /[a-z0-9_]+\s+in\s*/i;
			var inResults = inMatch.exec(forArgs);
			if (inResults) {
				forArgs = 'var ' + forArgs;
			}
			return prefix + 'for (' + resolve(forArgs) + ') {' + (forResults[2] ? ('//' + forResults[2]) : '');
		}

		var defResults = defSet.exec(line);
		if (defResults) {
			var args = defResults[2] || '';

			if (classLevel < 0) {
				return prefix + 'var ' + defResults[1] + ' = function' + parseArgs(args, nextWs) + (defResults[3] ? ('//' + defResults[3]) : '');
			} else {				
				return prefix + 'this.' + defResults[1] + ' = function' + parseArgs(args, nextWs) + (defResults[3] ? ('//' + defResults[3]) : '');
			}
		}

		var classResults = classSet.exec(line);
		if (classResults) {
			var args = classResults[2] || '';
			classLevel = indentLevel;

			return prefix + 'var ' + classResults[1] + ' = function' + parseArgs(args, nextWs) + (classResults[3] ? ('//' + classResults[3]) : '');

		}		

		var tryResults = trySet.exec(line);
		if (tryResults) {
			return prefix + 'try {';
		}

		var exceptResults = exceptSet.exec(line);
		if (exceptResults) {
			if (exceptResults[1]) {
				return prefix + 'catch (e if e instanceof ' + resolve(exceptResults[1]) + ') {' + (exceptResults[2] ? ('//' + exceptResults[2]) : '');

			} else {
				return prefix + 'catch (e) { ' + (exceptResults[2] ? ('//' + exceptResults[2]) : '');
			}
		}

		line = resolve(line.replace(/^\s*/, ''));

		return prefix + line + ';';
	}).reduce(append);
};

module.exports = IndianaConverter;


