# JSCompiler2 for [Brackets](https://github.com/adobe/brackets)

JSCompiler2 is a tool for [Brackets](https://github.com/adobe/brackets) that allows you to compress and mangle your JavaScript code into one minified file, powered by [UglifyJS2](https://github.com/mishoo/UglifyJS2)

## Features

- Doesn't require previous configurations for quick first use.
- Customize advanced compilation options.
- Compile multiple javascripts into one output.
- Generate multiple outputs at once.
- Works even offline.

## Usage

Simply press the "Compress JavaScript" button on the sidebar, or go to `File > Compress JavaScript`, and your code will be compressed into a `{filename}.min.js` file.

## The custom options file

You can go to `File > Compress JavaScript: Options` to open your custom options. If you have no custom options yet, you will be asked to choose one of this types of custom options:

- **Project**: Bracket's default. This will add your options to the default `.brackets.json` file along with all the other options shared inside your current project. Your options will be inside an object with the indentifier `jscompiler`.

- **Portable**: This will add your options to a `.jscompiler.json` file inside the current directory, which can be compatible with other compilers that use the same standard, and allows you to create multiple compilable projects inside your main project. On contrast, the current open file on your editor must be inside the same directory of the options file at the moment of compiling, or it will be ignored.

When the compilation starts, JSCompiler will give priority to any `.jscompiler.json` in the current folder, as this option will allow you to have custom sub-projects inside your main project. Then, it will search for any global options in the current project inside `.brackets.json`. If no option is found anywhere, it will attempt to compile then the current file, if it is a Javascript file.

## Custom options

In your options file, you can customize next values:

- **Inputs**: An array of javascript files to be compressed into the minified file.
- **Output**: The name of the resulting minified file.
- **GenerateMap**: A boolean value. If this is false, the source map for the code won't be generated.
- **Mangle**: A boolean value. If this is false, the code won't be mangled.
- **Isolate**: A boolean value. If this is true, the resulting code will be isolated so it won't affect or be affected by other scripts.
- **Precompile**: A boolean value. If this is true, the resulting code will be precompiled before it is parsed. This option is hidden by default, and should be used only if your code really requires it, as the resulting source map won't be able to point to the original source files.

If the isolate option is true, the resulting code will be wrapped with the next code:

```javascript
(function(window, undefined){
   // Your compiled code
}(window));
```

You can create multiple outputs by adding more JSON objects to the main **outputs** array.

Also, you can customize the default template for new projects at `File > Compress JavaScript: Options template`. Careful! This is only for advanced users. Updates will restore the template to prevent unexpected crashes.

## Special thanks

Special thanks to Steffen Bruchmann and Peter Flynn, who helped me a lot on my first steps with brackets extension development.

Special thanks also to miladd3, elegos, mrmckeb, kevinmerckx and bbak for their support and ideas through GitHub.

And special thanks too to mrmckeb for the new compiler icon.