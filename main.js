/*global brackets, define, $ */
define(function (require, exports, module) {
	'use strict';

	var Commands           = brackets.getModule('command/Commands'),
		CommandManager     = brackets.getModule('command/CommandManager'),
		Menus              = brackets.getModule('command/Menus'),
		DocumentManager    = brackets.getModule('document/DocumentManager'),
		FileSystem         = brackets.getModule('filesystem/FileSystem'),
		PreferencesManager = brackets.getModule('preferences/PreferencesManager'),
		ProjectManager     = brackets.getModule('project/ProjectManager'),
		ExtensionUtils     = brackets.getModule('utils/ExtensionUtils'),
		WorkspaceManager   = brackets.getModule('view/WorkspaceManager'),
		DefaultDialogs     = brackets.getModule('widgets/DefaultDialogs'),
		Dialogs            = brackets.getModule('widgets/Dialogs'),
		UglifyJS           = require('UglifyJS/uglifyjs'),
		
		menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU),
		bottomPanel = null,
		panelLog = null,
		toolbarIcon = null,
		pendingTasks = 0;
	
	window.MOZ_SourceMap   = require('./SourceMap/source-map');

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
			if (toolbarIcon.getAttribute('class') === 'active') {
				toolbarIcon.setAttribute('class', 'success');
			}
			window.setTimeout(function () {toolbarIcon.removeAttribute('class'); }, 3000);
		}
	}

	// UglifyJS call
	function doUglify(inputs, output, options) {
		bottomPanel.show();
		
		// Get current directory
		var directory = DocumentManager.getCurrentDocument().file.parentPath,
			path = directory + output,
		
		// Start UglifyJS magic!
			ast = null,
			code = null,
			compressor = UglifyJS.Compressor(),
			source_map = UglifyJS.SourceMap(),
			stream = UglifyJS.OutputStream({source_map: source_map}),
			i = 0,
			l = 0;
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
		code = stream.toString();
		
		// Append isolation code
		if (options && options.isolate) {
			appendLog('Isolating...');
			code = '(function(window,undefined){' + code + '})(window);';
		}
		
		appendLog('Exporting...');
		// Save the map
		if (!options || options.generateMap) {
			code += '\n//# sourceMappingURL=' + output.split('/').pop() + '.map';
			pendingTasks += 1;
			FileSystem.getFileForPath(path + '.map').write(source_map.toString(), {blind: true}, function (err) {
				if (err) {
					appendLog('Error generating map at:<br/>' + path + '.map');
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, 'JS Compiler', 'Error on map genetarion:\n' + err);
					toolbarIcon.setAttribute('class', 'error');
				} else {
					appendLog('Map successfully generated at:<br/>' + path + '.map');
				}
				taskDone();
			});
		}
		
		// Save the code
		pendingTasks += 1;
		FileSystem.getFileForPath(path).write(code, {blind: true}, function (err) {
			if (err) {
				appendLog('Error compiling code at:<br/>' + path);
				Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, 'JS Compiler', 'Error on compilation:\n' + err);
				toolbarIcon.setAttribute('class', 'error');
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
					appendLog('Error on reading ' + options.inputs[counter] + ': ' + err + '<br/>' + options.output + ' compilation cancelled.<br/>');
					toolbarIcon.setAttribute('class', 'warning');
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
				if (options.precompile) {
					appendLog('Precompiling code into: precompiled.js');
					var content = '',
						i = 0,
						l = 0;
					for (i = 0, l = contents.length; i < l; i += 1) {
						content += contents[i].content + '\n';
					}
					doUglify([{name: 'precompiled.js', content: content}], options.output, options);
				} else {
					doUglify(contents, options.output, options);
				}
			} else {
				appendLog('Something went wrong.<br/>Done!');
			}
		}
	}
	
	function compileWithOptions(content, directory) {
		var options = JSON.parse(content),
			i = 0,
			l = 0;
		if (options.outputs) {
			// Compile each output in options
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
	
	function compileJS() {
		log('Executing Command Compile');
		pendingTasks = 0;
		toolbarIcon.setAttribute('class', 'active');
		
		// Search for options file
		var currentFile = DocumentManager.getCurrentDocument().file,
			directory = currentFile.parentPath,
			preferences = null;
		FileSystem.getFileForPath(directory + '.jscompiler.json').read({}, function (err, content) {
			if (err) {
				if (err === 'NotFound') {
					// Options file not found. Using project options?
					bottomPanel.show();
					preferences = PreferencesManager.get('jscompiler');
					if (preferences !== undefined) {
						// Read project options file
						appendLog('Loading project options');
						compileWithOptions(preferences, directory);
					} else {
						// Options not found. Try to compile current file
						appendLog('No options file. Compiling current script');
						var ext = currentFile.name.split('.').pop();
						if (ext === 'js') {
							doUglify([{name: currentFile.name, content: DocumentManager.getCurrentDocument().getText()}], currentFile.name.replace(/\.js$/, '.min.js'));
						} else {
							// Current file is not JavaScript. Warn!
							appendLog('Current document is not JavaScript');
						}
					}
				} else {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, 'JS Compiler', 'Error on reading options:\n' + err);
					toolbarIcon.setAttribute('class', 'error');
				}
			} else {
				// Read portable options file
				bottomPanel.show();
				appendLog('Loading portable options');
				compileWithOptions(content, directory);
			}
		});
	}
	
	function generateOptions() {
		// Read the template
		ExtensionUtils.loadFile(module, 'templates/.jscompiler.json').then(function (result) {
			// Get directory and file name for project options
			var code = null,
				jsonCode = null,
				file = DocumentManager.getCurrentDocument().file,
				directory = file.parentPath,
				directories = directory.split('/'),
				dirname = directories.pop(),
				filename = file.name.replace(/\.js$/, ''),
				i = 0,
				j = 0,
				l = 0,
				jl = 0;
			window.console.log(directory);
			if (filename === file.name) {
				filename = 'script';
			}
			dirname = directories.pop();
			code = result.replace(/%DIRECTORY%/g, dirname).replace(/%FILENAME%/g, filename);
			
			// Ask the user which class of options file wants to use
			Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'Options file not found', 'Select the type of options file you want to use for this project:', [{className: Dialogs.DIALOG_BTN_CLASS_LEFT, id: Dialogs.DIALOG_BTN_CANCEL, text: 'Cancel'}, {className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: 'project', text: 'Project'}, {className: Dialogs.DIALOG_BTN_CLASS_NORMAL, id: 'portable', text: 'Portable'}]).done(function (id) {
				window.console.log('ID: ' + id);
				if (id === 'project') {
					// Create options in project file
					jsonCode = JSON.parse(code);
					directory = ProjectManager.makeProjectRelativeIfPossible(directory);
					for (i = 0, l = jsonCode.outputs.length; i < l; i += 1) {
						// Assign relative path to each input and output
						for (j = 0, jl = jsonCode.outputs[i].inputs.length; j < jl; j += 1) {
							jsonCode.outputs[i].inputs[j] = directory + jsonCode.outputs[i].inputs[j];
						}
						jsonCode.outputs[i].output = directory + jsonCode.outputs[i].output;
					}
					PreferencesManager.set('jscompiler', jsonCode, {location: {scope: 'project'}});
					// Open project options file
					window.setTimeout(function () {CommandManager.execute(Commands.CMD_OPEN, {fullPath: ProjectManager.getProjectRoot().fullPath + '.brackets.json'}); }, 200);
				} else if (id === 'portable') {
					// Create portable options file
					FileSystem.getFileForPath(directory + '.jscompiler.json').write(code, {blind: true}, function (err) {
						if (err) {
							Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, 'JS Compiler', 'Error on creating options:\n' + err);
						} else {
							// Open options file
							CommandManager.execute(Commands.CMD_OPEN, {fullPath: directory + '.jscompiler.json'});
						}
					});
				}
			});
		});
	}
	
	function openOptions() {
		var directory = DocumentManager.getCurrentDocument().file.parentPath,
			path = directory + '.jscompiler.json',
			preferences = null;
		
		// Reading the options file content
		FileSystem.getFileForPath(path).read({}, function (err, content) {
			if (err) {
				if (err === 'NotFound') {
					// Options file not found. Using project options?
					preferences = PreferencesManager.get('jscompiler');
					if (preferences !== undefined) {
						// Open project options file
						CommandManager.execute(Commands.CMD_OPEN, {fullPath: ProjectManager.getProjectRoot().fullPath + '.brackets.json'});
					} else {
						// Options not found. Generate
						log('Options file not found. Creating!');
						generateOptions();
					}
				} else {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, 'JS Compiler', 'Error on reading options:\n' + err);
				}
			} else {
				// Open portable options file
				CommandManager.execute(Commands.CMD_OPEN, {fullPath: path});
			}
		});
	}
	
	function openTemplate() {
		var path = ExtensionUtils.getModulePath(module, 'templates/.jscompiler.json');
		
		// Reading the options template... Just to be sure no one has deleted it accidentally...
		FileSystem.getFileForPath(path).read({}, function (err, content) {
			if (err) {
				Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, 'JS Compiler', 'Error on reading template:\n' + err);
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
	menu.addMenuDivider();
	
	// Register commands
	CommandManager.register('Compress JavaScript', 'jscompiler.compile', compileJS);
	menu.addMenuItem('jscompiler.compile');
	
	CommandManager.register('Compress JavaScript: Options', 'jscompiler.options', openOptions);
	menu.addMenuItem('jscompiler.options');
	
	CommandManager.register('Compress JavaScript: Options template', 'jscompiler.template', openTemplate);
	menu.addMenuItem('jscompiler.template');
	
	// Start bottom panel
	bottomPanel = WorkspaceManager.createBottomPanel('jscompiler.panel', $('<div id="jscompiler-panel" class="bottom-panel vert-resizable top-resizer" style="box-sizing: border-box; height: 200px; display: block;"><div class="toolbar simple-toolbar-layout"><div class="title">JSCompiler</div> <a href="#" class="close">×</a></div><div id="log" class="table-container resizable-content" style="height: 170px"></div></div></div>'));
	panelLog = bottomPanel.$panel.find('#log');
	bottomPanel.$panel.find('.close').on('click', closePanel);
	
	// Load css
	ExtensionUtils.loadStyleSheet(module, 'styles/main.css');
	
	// Add toolbar icon
	toolbarIcon = $('<a>')
		.attr({
			id: 'toolbar-jscompiler',
			title: 'Compress JavaScript',
			href: '#'
		})
		.click(compileJS)
		.appendTo($('#main-toolbar .buttons'))[0];
});
