define(function (require, exports, module) {
	'use strict';

	var Commands         = brackets.getModule('command/Commands');
	var CommandManager   = brackets.getModule('command/CommandManager');
	var Menus            = brackets.getModule('command/Menus');
	var DocumentManager  = brackets.getModule('document/DocumentManager');
	var FileSystem       = brackets.getModule('filesystem/FileSystem');
	var ExtensionUtils   = brackets.getModule('utils/ExtensionUtils');
	var WorkspaceManager = brackets.getModule('view/WorkspaceManager');
	var DefaultDialogs   = brackets.getModule('widgets/DefaultDialogs');
	var Dialogs          = brackets.getModule('widgets/Dialogs');
	var UglifyJS         = require('UglifyJS/uglifyjs');
	window.MOZ_SourceMap = require('./SourceMap/source-map');
	
	var pendingTasks = 0;

	// Log
	function log(s) {
		window.console.log('[JSCompiler] ' + s);
	}

	function appendLog(s) {
		panelLog.append('<br/>' + s);
		panelLog.scrollTop(panelLog[0].scrollHeight);
	}
	
	function taskDone() {
		pendingTasks -= 1;
		if (pendingTasks < 1) {
			appendLog('Done!<br/>');
		}
	}

	// UglifyJS call
	function doUglify(inputs, output, options) {
		bottomPanel.show();
		
		// Get current directory
		var directory = DocumentManager.getCurrentDocument().file.parentPath;
		var path = directory + output;
		
		// Start UglifyJS magic!
		var ast = null;
		var compressor = UglifyJS.Compressor();
		var source_map = UglifyJS.SourceMap();
		var stream = UglifyJS.OutputStream({source_map: source_map});
		var i, l;
		for (i = 0, l = inputs.length; i < l; i += 1) {
			appendLog('Parsing file: ' + inputs[i].name);
			ast = UglifyJS.parse(inputs[i].content, {filename: inputs[i].name, toplevel: ast});
		}
		appendLog('Compressing...');
		ast.figure_out_scope();
		ast.transform(compressor);
		if (!options || options.mangle) {
			appendLog('Mangling...');
			ast.figure_out_scope();
			ast.compute_char_frequency();
			ast.mangle_names();
		}
		appendLog('Extracting...');
		ast.print(stream);
		var code = stream.toString();
		
		// Append isolation code
		if (options && options.isolate) {
			appendLog('Isolating...');
			code = '(function(window,undefined){' + code + '})(window);';
		}
		
		appendLog('Exporting...');
		// Save the map
		if (!options || options.generateMap) {
			code += '\n//# sourceMappingURL=' + output + '.map';
			var map = source_map.toString();
			pendingTasks += 1;
			FileSystem.getFileForPath(path + '.map').write(map, {blind: true}, function (err) {
				if (err) {
					appendLog('Error generating map at:<br/>' + path + '.map');
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on map genetarion:\n' + err);
				} else {
					appendLog('Map successfully generated at:<br/>\n' + path + '.map');
				}
				taskDone();
			});
		}
		
		// Save the code
		pendingTasks += 1;
		FileSystem.getFileForPath(path).write(code, {blind: true}, function (err) {
			if (err) {
				appendLog('Error compiling code at:<br/>' + path);
				Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on compilation:\n' + err);
			} else {
				appendLog('File successfully compiled at:<br/>' + path);
			}
			taskDone();
		});
	}
	
	function getContentsFrom(options, directory, contents, counter) {
		if (counter < options.inputs.length) {
			// There is content pending to get. Read it!
			appendLog('Reading ' + options.inputs[counter] + '...');
			
			FileSystem.getFileForPath(directory + options.inputs[counter]).read({}, function (err, content) {
				if (err) {
					appendLog('Error on reading this file: ' + err);
				} else {
					// Read content
					contents.push({name: options.inputs[counter], content: content});
					getContentsFrom(options, directory, contents, counter + 1);
				}
			});
		} else {
			// Contents where collected
			if (contents.length > 0) {
				// Finally compile the code
				doUglify(contents, options.output, options);
			} else {
				appendLog('Something went wrong.<br/>Done!');
			}
		}
	}
	
	function compileJS() {
		log('Executing Command Compile');
		pendingTasks = 0;
		
		// Search for options file
		var currentFile = DocumentManager.getCurrentDocument().file;
		var directory = currentFile.parentPath;
		FileSystem.getFileForPath(directory + '.jscompiler.json').read({}, function (err, content) {
			if (err) {
				if (err === 'NotFound') {
					// Options file not found. Try to compile current file
					bottomPanel.show();
					appendLog('No options file. Compiling current script');
					var ext = currentFile.name.split('.').pop();
					if (ext === 'js') {
						doUglify([{name: currentFile.name, content: DocumentManager.getCurrentDocument().getText()}], currentFile.name.replace(/\.js$/, '.min.js'));
					} else {
						// Current file is not JavaScript. Warn!
						appendLog('Current document is not JavaScript');
					}
				} else {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on reading options:\n' + err);
				}
			} else {
				// Open options template
				bottomPanel.show();
				appendLog('Loading options');
				var options = JSON.parse(content);
				if (options.outputs) {
					// Compile each output in options
					var i, l;
					l = options.outputs.length;
					appendLog('Found ' + l + ' outputs');
					for (i = 0; i < l; i += 1) {
						appendLog('Generating ' + options.outputs[i].output);
						getContentsFrom(options.outputs[i], directory, [], 0);
					}
				} else {
					// Compile with old single output option format
					appendLog('Generating ' + options.output);
					getContentsFrom(options, directory, [], 0);
				}
			}
		});
	}
	
	function generateOptions() {
		// Read the template
		ExtensionUtils.loadFile(module, 'templates/.jscompiler.json').then(function (result) {
			// Get directory and file name for project options
			var file = DocumentManager.getCurrentDocument().file;
			var directory = file.parentPath;
			var directories = directory.split('/');
			directories.pop();
			var dirname = directories.pop();
			var filename = file.name.replace(/\.js$/, '');
			if (filename === file.name) {
				filename = 'script';
			}
			var code = result.replace(/%DIRECTORY%/g, dirname).replace(/%FILENAME%/g, filename);
			// Create options file
			FileSystem.getFileForPath(directory + '.jscompiler.json').write(code, {blind: true}, function (err) {
				if (err) {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on creating options:\n' + err);
				} else {
					// Open options file
					CommandManager.execute(Commands.CMD_OPEN, {fullPath: directory + '.jscompiler.json'});
				}
			});
		});
	}
	
	function openOptions() {
		var directory = DocumentManager.getCurrentDocument().file.parentPath;
		var path = directory + '.jscompiler.json';
		
		// Reading the options file content
		FileSystem.getFileForPath(path).read({}, function (err, content) {
			if (err) {
				if (err === 'NotFound') {
					// Options file not found. Generate
					log('Options file not found. Creating!');
					generateOptions();
				} else {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on reading options:\n' + err);
				}
			} else {
				// Open options file
				CommandManager.execute(Commands.CMD_OPEN, {fullPath: path});
			}
		});
	}
	
	function openTemplate() {
		var path = ExtensionUtils.getModulePath(module, 'templates/.jscompiler.json');
		
		// Reading the options template... Just to be sure no one has deleted it accidentally...
		FileSystem.getFileForPath(path).read({}, function (err, content) {
			if (err) {
				Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on reading template:\n' + err);
			} else {
				// Open options template
				CommandManager.execute(Commands.CMD_OPEN, {fullPath: path});
			}
		});
	}
	
	function closePanel() {
		bottomPanel.hide();
	}
	
	// Add file menu option
	var menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
	menu.addMenuDivider();
	
	// Register commands
	CommandManager.register('Compress JavaScript', 'jscompiler.compile', compileJS);
	menu.addMenuItem('jscompiler.compile');
	
	CommandManager.register('Compress JavaScript: Options', 'jscompiler.options', openOptions);
	menu.addMenuItem('jscompiler.options');
	
	CommandManager.register('Compress JavaScript: Options template', 'jscompiler.template', openTemplate);
	menu.addMenuItem('jscompiler.template');
	
	// Start bottom panel
	var bottomPanel = WorkspaceManager.createBottomPanel('jscompiler.panel', $("<div id='jscompiler-panel' class='bottom-panel vert-resizable top-resizer' style='box-sizing: border-box; height: 200px; display: block;'><div class='toolbar simple-toolbar-layout'><div class='title'>JSCompiler</div> <a href='#' class='close'>×</a></div><div id='log' class='table-container resizable-content' style='height: 170px'></div></div></div>"));
	var panelLog = bottomPanel.$panel.find('#log');
	bottomPanel.$panel.find('.close').on('click', closePanel);
	
	// Load css
	ExtensionUtils.loadStyleSheet(module, 'styles/main.css');
	
	// Add toolbar icon
	$('<a>')
		.attr({
			id: 'toolbar-jscompiler',
			title: 'Compress JavaScript',
			href: '#'
		})
		.click(compileJS)
		.appendTo($('#main-toolbar .buttons'));
});
