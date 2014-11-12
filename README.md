# JSCompiler2 for [Brackets](https://github.com/adobe/brackets)

JSCompiler2 is a tool for [Brackets](https://github.com/adobe/brackets) that allows you to compress and mangle your JavaScript code into one minified file, powered by [UglifyJS2](https://github.com/mishoo/UglifyJS2)

## Usage

Simply press the "Compress JavaScript" button on the sidebar, or go to `File > Compress JavaScript`, and your code will be compressed into a `{filename}.min.js` file.

### Advanced options

You can go to `File > Compress JavaScript: Options` to open a JSON file with the compiler options for the currect directory. There you can customize next values:

- **Project**: The name of the current project.
- **Inputs**: An array of javascript files to be compressed into the minified file.
- **Output**: The name of the resulting minified file.
- **Isolate**: A boolean value. If this is true, the resulting code will be isolated so it wont affect or be affected by other scripts.

If the isolate option is true, the resulting code will be wrapped with the next code, assigned to a variable named as the project, so external scripts can access properly to it's content:

```javascript
var ProjectName = (function(window, undefined){
   // Your compiled code
})(window);
```

If you don't want your code be accesible to other scripts, just leave the project name with an empty string, resulting the wrapper as shown next:

```javascript
(function(window, undefined){
   // Your compiled code
})(window);
```

You can also customize the default template for new projects at `File > Compress JavaScript: Options template`. Careful! This is only for advanced users. Updates will restore the template to prevent unexpected crashes.

## Special thanks

Special thanks to Steffen Bruchmann and Peter Flynn, who helped me a lot on my first steps with brackets extension development.