const chai = require("chai");
const fs = require("fs");
const path = require("path");
const { unified } = require("unified");
const { remark } = require("remark");
const remarkParse = require("remark-parse").default;
const remarkRehype = require("remark-rehype").default;
const html = require("rehype-stringify").default;
const plugin = require("../index");
const plantumlEncoder = require("plantuml-encoder");
const proxyquire = require("proxyquire");

// Minimal test plugin to verify unified pipeline works
function minimalTestPlugin() {
  return function transformer(tree) {
    // Do nothing, just return the tree
    return tree;
  };
}

// Alternative: direct transformer function
function directTransformer(tree) {
  // Do nothing, just return the tree
  return tree;
}

describe("Plugin", () => {
  beforeEach(function() {
    this.timeout(10000);
  });

  // Helper: create a plugin with a mocked fetch
  function getPluginWithMockedFetch(fetchImpl) {
    return proxyquire("../index", {
      "node-fetch": fetchImpl
    });
  }

  it("should convert PlantUML code to Image nodes with PNG output", async () => {
    // Mock fetch to return a PNG buffer
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakePng });

    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source.md")).toString();
    const expected = fs.readFileSync(path.resolve(__dirname, "./resources/expected.md")).toString();

    const output = await remark()
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineSvg: false,
        fetch: fetchImpl
      })
      .process(input);

    // Check that the output contains image references to local files
    chai.assert.include(output.toString(), "![");
    chai.assert.include(output.toString(), "plantuml-");
  });

  it("should convert PlantUML code to inline SVG", async () => {
    // Mock fetch to return a fake SVG buffer
    const fakeSvg = Buffer.from('<svg><rect width="100" height="100"/></svg>', "utf8");
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakeSvg });

    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source.md")).toString();

    const output = await remark()
      .use(plugin, {
        outputFormat: "svg",
        outputDir: "./test/static",
        inlineSvg: true,
        fetch: fetchImpl
      })
      .process(input);

    // Check that the output contains inline SVG
    chai.assert.include(output.toString(), '<div class="plantuml-diagram">');
    chai.assert.include(output.toString(), "<svg");
  });

  it("should process include directives for .puml files", async () => {
    // Mock fetch to return a PNG buffer
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakePng });

    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source-with-include.md")).toString();

    const output = await remark()
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        includePath: path.resolve(__dirname, "./resources"),
        inlineSvg: false,
        fetch: fetchImpl
      })
      .process(input);

    // Check that the output contains image references
    chai.assert.include(output.toString(), "![");
    chai.assert.include(output.toString(), "plantuml-");
  });

  it("should work with minimal test plugin in unified pipeline", async () => {
    const input = "# Test heading\n\nSome content";

    const processor = remark();

    const output = await processor
      .use(minimalTestPlugin)
      .use(remarkRehype)
      .use(html)
      .process(input);

    const htmlOutput = output.toString();
    chai.assert.include(htmlOutput, "<h1>Test heading</h1>", "Should convert markdown to HTML");
  });

  it("should work with direct transformer function", async () => {
    const input = "# Test heading\n\nSome content";

    const output = await remark()
      .use(directTransformer)
      .use(remarkRehype)
      .use(html)
      .process(input);

    const htmlOutput = output.toString();
    chai.assert.include(htmlOutput, "<h1>Test heading</h1>", "Should convert markdown to HTML");
  });

  it("should work with unified pipeline and explicit plugins", async () => {
    const input = "# Test heading\n\nSome content";

    const output = await unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(html)
      .process(input);

    const htmlOutput = output.toString();
    chai.assert.include(htmlOutput, "<h1>Test heading</h1>", "Should convert markdown to HTML");
  });

  it("should convert PlantUML code blocks to image tags in HTML output", async () => {
    // Mock fetch to return a PNG buffer
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakePng });

    const input = ["```plantuml", "class TestClass {", "  + test(): void", "}", "```"].join("\n");

    // Build the processor using unified pipeline as per docs
    const processor = unified()
      .use(remarkParse)
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineSvg: false,
        fetch: fetchImpl
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(html, { allowDangerousHtml: true });

    // Process the input through the full pipeline
    const output = await processor.process(input);
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
    // Mock fetch to always throw
    const fetchImpl = async () => {
      throw new Error("Simulated network error");
    };

    const input = "```plantuml\ninvalid plantuml code\n```";

    // Suppress console.error for this test
    const originalConsoleError = console.error;
    console.error = () => {}; // Suppress error output

    try {
      const output = await remark()
        .use(plugin, {
          outputFormat: "png",
          outputDir: "./test/static",
          inlineSvg: false,
          fetch: fetchImpl
        })
        .process(input);

      // Should output a fallback link if processing fails
      chai.assert.include(output.toString(), "PlantUML diagram");
      chai.assert.include(output.toString(), "https://www.plantuml.com/plantuml/png/");
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  });

  it("should fallback to PlantUML image link if server is unavailable", async () => {
    // Mock fetch to always throw
    const fetchImpl = async () => {
      throw new Error("Simulated network error");
    };
    const testInput = ["```plantuml", "class FallbackTest {", "  + fallback(): void", "}", "```"].join("\n");

    const output = await unified()
      .use(remarkParse)
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineSvg: false,
        fetch: fetchImpl
      })
      .use(remarkRehype)
      .use(html)
      .process(testInput);

    const htmlOutput = output.toString();

    // Use regex to extract the fallback URL
    const match = htmlOutput.match(/https:\/\/www\.plantuml\.com\/plantuml\/png\/([^"]+)/);
    chai.assert(match, "HTML output should contain a fallback PlantUML image link");
    const fallbackUrl = match[1];
    chai.assert.isString(fallbackUrl);
    chai.assert.isAbove(fallbackUrl.length, 10, "Encoded PlantUML string should be present in fallback URL");
  });

  it("should use custom urlPrefix in generated image URLs", async () => {
    // Mock fetch to return a PNG buffer
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakePng });

    const input = ["```plantuml", "class UrlPrefixTest {", "  + test(): void", "}", "```"].join("\n");

    const output = await unified()
      .use(remarkParse)
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineSvg: false,
        urlPrefix: "/assets/images/",
        fetch: fetchImpl
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(html, { allowDangerousHtml: true })
      .process(input);

    const htmlOutput = output.toString();

    // Should contain the custom urlPrefix in the image src
    chai.assert.include(htmlOutput, 'src="/assets/images/', "HTML output should contain the custom urlPrefix");
    chai.assert.include(htmlOutput, "plantuml-", "HTML output should contain the generated PNG filename");
  });

  it("should use default urlPrefix when not specified", async () => {
    // Mock fetch to return a PNG buffer
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakePng });

    const input = ["```plantuml", "class DefaultPrefixTest {", "  + test(): void", "}", "```"].join("\n");

    const output = await unified()
      .use(remarkParse)
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineSvg: false,
        fetch: fetchImpl
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(html, { allowDangerousHtml: true })
      .process(input);

    const htmlOutput = output.toString();

    // Should contain the default urlPrefix (/) in the image src
    chai.assert.include(htmlOutput, 'src="/', "HTML output should contain the default urlPrefix");
    chai.assert.notInclude(htmlOutput, 'src="//', "HTML output should not have double slashes");
    chai.assert.include(htmlOutput, "plantuml-", "HTML output should contain the generated PNG filename");
  });
});
