define(function (require, exports, module) {
	'use strict';

	var CommandManager  = brackets.getModule('command/CommandManager');
	var Menus           = brackets.getModule('command/Menus');
	var DocumentManager = brackets.getModule('document/DocumentManager');
	var FileSystem      = brackets.getModule('filesystem/FileSystem');
	var ExtensionUtils  = brackets.getModule('utils/ExtensionUtils');
	var WorkspaceManager	= brackets.getModule('view/WorkspaceManager');
	var DefaultDialogs  = brackets.getModule('widgets/DefaultDialogs');
	var Dialogs         = brackets.getModule('widgets/Dialogs');
	var MOZ_SourceMap	= require('SourceMap/source-map');
	var UglifyJS        = require('UglifyJS/uglifyjs');

	// Log
	function log(s) {
		console.log('[JSCompiler] ' + s);
	}

	function appendLog(s) {
		panelLog.append('<br/>' + s);
		panelLog.scrollTop(panelLog[0].scrollHeight);
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
			bottomPanel.show();
			
			// Get current file path
			var path = currentFile.fullPath.replace(/\.js$/, '.min.js');
			var path_map = currentFile.fullPath.replace(/\.js$/, '.map');
			appendLog('Compiling file:<br/>' + currentFile.fullPath);
			
			// Get current document text
			var currentDocumentText = DocumentManager.getCurrentDocument().getText();
			//log(currentDocumentText);

			// Start UglifyJS magic!
			var ast = null;
			var compressor = UglifyJS.Compressor();
			var source_map = UglifyJS.SourceMap();
			var stream = UglifyJS.OutputStream();
			var stream = UglifyJS.OutputStream({source_map: source_map});
			appendLog('Parsing...');
			ast = UglifyJS.parse(currentDocumentText, {filename: currentFile.fullPath, toplevel: ast});
			appendLog('Compressing...');
			ast.figure_out_scope();
			ast.transform(compressor);
			appendLog('Mangling...');
			ast.figure_out_scope();
			ast.compute_char_frequency();
			ast.mangle_names();
			appendLog('Extracting...');
			ast.print(stream);
			var code = stream.toString();
			var map = source_map.toString();
			//log(code);
			
			appendLog('Exporting...');
			// Save the code
			FileSystem.getFileForPath(path).write(code, {blind: true}, function (err) {
				if (err) {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on compilation:\n' + err);
				} else {
					appendLog('File successfully compiled at:<br/>' + path);
				}
			});
			
			// Save the map
			FileSystem.getFileForPath(path_map).write(code, {blind: true}, function (err) {
				if (err) {
					Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, 'JS Compiler', 'Error on map genetarion:\n' + err);
				} else {
					appendLog('Map successfully generated at:\n' + path_map + '<br/>Done!<br/>');
				}
			});
		}
	}

	function closePanel() {
		bottomPanel.hide();
	}

	// Add file menu option
	var menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
	menu.addMenuDivider();

	// Register commands
	CommandManager.register('Compress JavaScript', 'jscompiler.compile', doUglify);
	menu.addMenuItem('jscompiler.compile');

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
		.click(doUglify)
		.appendTo($('#main-toolbar .buttons'));
});