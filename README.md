# Remark PlantUML Local Plugin

[![Build Status](https://travis-ci.org/crooy/remark-plantuml-local.svg?branch=master)](https://travis-ci.org/crooy/remark-plantuml-local) [![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

`remark-plantuml-local` is a plugin for [remarkjs](https://github.com/remarkjs/remark) that converts PlantUML code blocks to local image files. The plugin supports including external `.puml` files and can store generated images locally or inline SVG content.

## Installing

```bash
npm install --save remark-plantuml-local
```

## Example

You can use this plugin like following

### Markdown

````markdown
# Your markdown including PlantUML code block

```plantuml Your title
class SimplePlantUMLPlugin {
    + transform(syntaxTree: AST): AST
}
```

# Including external .puml files

```plantuml
!include diagram.puml

class MainClass {
    + main(): void
}
```
````

### JavaScript

```javascript
const remark = require("remark");
const plantumlLocal = require("remark-plantuml-local");
const fs = require("fs");
const path = require("path");

const input = fs.readFileSync(path.resolve(__dirname, "./your-markdown.md")).toString();
const output = await remark().use(plantumlLocal).process(input);

console.log(output.toString());
// will generate local image files or inline SVG content
```

## Plugin Options

The plugin supports various configuration options:

```javascript
const options = {
  baseUrl: "https://www.plantuml.com/plantuml", // PlantUML server URL
  outputFormat: "png", // "png" or "svg"
  outputDir: "./static", // Directory to store generated images
  inlineSvg: true, // Whether to inline SVG content (only applies when outputFormat is "svg")
  includePath: "./" // Base path for resolving included .puml files
};

remark().use(simplePlantUML, options).process(input);
```

### Option Details

- **baseUrl**: The PlantUML server URL (default: `https://www.plantuml.com/plantuml`)
- **outputFormat**: Output format for diagrams - `"png"` or `"svg"` (default: `"png"`)
- **outputDir**: Directory where generated images will be stored (default: `"./static"`)
- **inlineSvg**: When `outputFormat` is `"svg"`, whether to inline the SVG content in HTML or save as files (default: `true`)
- **includePath**: Base path for resolving `!include` directives in PlantUML code (default: `"./"`)

## Features

### Include External .puml Files

The plugin supports PlantUML's `!include` directive for `.puml` files:

```plantuml
!include common-styles.puml
!include diagram.puml

class MyClass {
    + method(): void
}
```

### Local Image Storage

Instead of using external PlantUML URLs, the plugin fetches the generated images and stores them locally in the specified `outputDir`.

### Inline SVG Support

When using SVG format with `inlineSvg: true`, the plugin embeds the SVG content directly in the HTML output:

```html
<div class="plantuml-diagram">
  <svg>...</svg>
</div>
```

## Integration

You can use this plugin in any frameworks support remarkjs.

If you want to use in the classic preset of [Docusaurus 2](https://v2.docusaurus.io/), like me, set configuration in your `docusaurus.config.js` like following.

```javascript
const plantumlLocal = require("remark-plantuml-local");

// your configurations...

presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          remarkPlugins: [[plantumlLocal, {
            outputFormat: "svg",
            inlineSvg: true,
            outputDir: "./static/diagrams"
          }]]
        }
      }
    ]
  ],

//...
```

## GitLab Compatibility

This plugin follows the [GitLab PlantUML specification](https://docs.gitlab.com/administration/integration/plantuml/) for the most part, supporting:

- PlantUML code blocks in markdown
- Include directives for `.puml` files
- Various output formats (PNG/SVG)
