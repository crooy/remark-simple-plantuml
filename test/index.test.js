const chai = require("chai");
const fs = require("fs");
const path = require("path");
const remark = require("remark");
const remarkRehype = require("remark-rehype");
const html = require("rehype-stringify");
const plugin = require("../index");

describe("Plugin", () => {
  beforeEach(function() {
    this.timeout(10000);
  });

  it("should convert PlantUML code to Image nodes with PNG output", async () => {
    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source.md")).toString();
    const expected = fs.readFileSync(path.resolve(__dirname, "./resources/expected.md")).toString();

    const output = await remark()
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineSvg: false
      })
      .process(input);

    // Check that the output contains image references to local files
    chai.assert.include(output.toString(), "![");
    chai.assert.include(output.toString(), "plantuml-");
  });

  it("should convert PlantUML code to inline SVG", async () => {
    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source.md")).toString();

    const output = await remark()
      .use(plugin, {
        outputFormat: "svg",
        outputDir: "./test/static",
        inlineSvg: true
      })
      .process(input);

    // Check that the output contains inline SVG
    chai.assert.include(output.toString(), '<div class="plantuml-diagram">');
    chai.assert.include(output.toString(), "<svg");
  });

  it("should process include directives for .puml files", async () => {
    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source-with-include.md")).toString();

    const output = await remark()
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        includePath: path.resolve(__dirname, "./resources"),
        inlineSvg: false
      })
      .process(input);

    // Check that the output contains image references
    chai.assert.include(output.toString(), "![");
    chai.assert.include(output.toString(), "plantuml-");
  });

  it("should convert PlantUML code blocks to image tags in HTML output", async () => {
    const input = ["```plantuml", "class TestClass {", "  + test(): void", "}", "```"].join("\n");

    const output = await remark()
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineSvg: false
      })
      .use(remarkRehype)
      .use(html)
      .process(input);

    const htmlOutput = output.toString();

    // Should NOT contain the original PlantUML code block
    chai.assert.notInclude(
      htmlOutput,
      "```plantuml",
      "HTML output should not contain the original plantuml code block"
    );
    chai.assert.notInclude(htmlOutput, "class TestClass", "HTML output should not contain the original PlantUML code");

    // Should contain an img tag
    chai.assert.include(htmlOutput, "<img", "HTML output should contain an <img> tag");
    chai.assert.include(htmlOutput, "plantuml-", "HTML output should contain the generated PNG filename");
  });

  it("should handle errors gracefully and keep original code blocks", async () => {
    const input = "```plantuml\ninvalid plantuml code\n```";

    // Suppress console.error for this test
    const originalConsoleError = console.error;
    console.error = () => {}; // Suppress error output

    try {
      const output = await remark()
        .use(plugin, {
          outputFormat: "png",
          outputDir: "./test/static",
          inlineSvg: false
        })
        .process(input);

      // Should keep the original code block if processing fails
      chai.assert.include(output.toString(), "```plantuml");
      chai.assert.include(output.toString(), "invalid plantuml code");
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  });
});
