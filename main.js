define(function (require, exports, module) {
	'use strict';

	var CommandManager  = brackets.getModule('command/CommandManager');
	var Menus           = brackets.getModule('command/Menus');
	var DocumentManager = brackets.getModule('document/DocumentManager');
	var FileSystem      = brackets.getModule('filesystem/FileSystem');
	var ExtensionUtils  = brackets.getModule('utils/ExtensionUtils');
	var DefaultDialogs  = brackets.getModule('widgets/DefaultDialogs');
	var Dialogs         = brackets.getModule('widgets/Dialogs');
	var UglifyJS        = require('UglifyJS/uglifyjs');

	var COMMAND_ID   = 'jscompiler.compile';
	var COMMAND_NAME = 'Compress JavaScript';

	// Log
	function log(s) {
		console.log('[JSCompiler] '+s);
	}

	// UglifyJS call
	function doUglify() {
		log('Executing Command Compile');
		
		// Get current file extension
		var currentFile = DocumentManager.getCurrentDocument().file;
		var ext = currentFile.name.split('.').pop();
		if (ext != 'js') {
			// Current file is not JavaScript. Warn!
			Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Current document is not JavaScript');
		} else {
			// Get current file path
			var path = currentFile.fullPath.replace(/\.js$/, '.min.js');
			//log('Compiling ' + path);
			
			// Get current document text
			var currentDocumentText = DocumentManager.getCurrentDocument().getText();
			//log(currentDocumentText);

			// Start UglifyJS magic!
			var ast=UglifyJS.parse(currentDocumentText);
			var compressor=UglifyJS.Compressor();
			ast.figure_out_scope();
			ast.transform(compressor)
			ast.figure_out_scope();
			ast.compute_char_frequency();
			ast.mangle_names();
			var code = ast.print_to_string();
			//log(code);
			
			// Save the code
			FileSystem.getFileForPath(path).write(code, {blind: true}, function(err){
				if (err) {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on compilation:\n' + err);
				} else {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'File successfully compiled at:\n' + path);
				}
			});
		}
	}

	// Register command
	CommandManager.register(COMMAND_NAME, COMMAND_ID, doUglify);

	// Add file menu option
	var menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
	menu.addMenuDivider();
	menu.addMenuItem(COMMAND_ID);

	// Load css
	ExtensionUtils.loadStyleSheet(module, 'styles/main.css');

	// Add toolbar icon
	$('<a>')
		.attr({
			id: 'toolbar-jscompiler',
			title: COMMAND_NAME,
			href: '#'
		})
		.click(doUglify)
		.appendTo($('#main-toolbar .buttons'));
});