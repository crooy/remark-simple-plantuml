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
        inlineImage: false,
        fetch: fetchImpl
      })
      .process(input);

    // Check that the output contains image references to local files
    chai.assert.include(output.toString(), "![");
    chai.assert.include(output.toString(), "plantuml-");
  });

  it("should convert PlantUML code to inline SVG (PlantUML server URL)", async () => {
    // Mock fetch to return a fake SVG buffer (should not be used for inlineImage: true)
    const fakeSvg = Buffer.from('<svg><rect width="100" height="100"/></svg>', "utf8");
    let fetchCalled = false;
    const fetchImpl = async () => {
      fetchCalled = true;
      return { ok: true, buffer: async () => fakeSvg };
    };

    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source.md")).toString();

    const output = await remark()
      .use(plugin, {
        outputFormat: "svg",
        outputDir: "./test/static",
        inlineImage: true,
        fetch: fetchImpl
      })
      .process(input);

    // Should contain an image node with a PlantUML server URL
    const outStr = output.toString();
    chai.assert.include(outStr, "![", "Should contain a markdown image node");
    chai.assert.include(outStr, "https://www.plantuml.com/plantuml/svg/", "Should use PlantUML server URL for SVG");
    chai.assert.notInclude(outStr, "plantuml-", "Should not reference a local file");
    chai.assert.isFalse(fetchCalled, "Fetch should not be called when inlineImage is true");
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
        inlineImage: false,
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
        inlineImage: false,
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

  it("should handle errors gracefully and output fallback image", async () => {
    // Mock fetch to always throw
    const fetchImpl = async () => {
      throw new Error("Simulated network error");
    };

    const input = "```plantuml\ninvalid plantuml code\n```";

    // Suppress console.error for this test
    const originalConsoleError = console.error;
    console.error = () => {}; // Suppress error output

    try {
      const output = await unified()
        .use(remarkParse)
        .use(plugin, {
          outputFormat: "png",
          outputDir: "./test/static",
          inlineImage: false,
          fetch: fetchImpl
        })
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(html, { allowDangerousHtml: true })
        .process(input);

      const htmlOutput = output.toString();

      // Should output a fallback image tag if processing fails
      chai.assert.include(htmlOutput, "<img", "HTML output should contain an <img> tag");
      chai.assert.include(htmlOutput, "https://www.plantuml.com/plantuml/png/", "HTML output should contain PlantUML server URL");
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  });

  it("should fallback to PlantUML image if server is unavailable", async () => {
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
        inlineImage: false,
        fetch: fetchImpl
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(html, { allowDangerousHtml: true })
      .process(testInput);

    const htmlOutput = output.toString();

    // Should contain an img tag with PlantUML server URL
    chai.assert.include(htmlOutput, "<img", "HTML output should contain an <img> tag");
    chai.assert.include(htmlOutput, "https://www.plantuml.com/plantuml/png/", "HTML output should contain PlantUML server URL");

    // Use regex to extract the fallback URL
    const match = htmlOutput.match(/https:\/\/www\.plantuml\.com\/plantuml\/png\/([^"]+)/);
    chai.assert(match, "HTML output should contain a fallback PlantUML image URL");
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
        inlineImage: false,
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

  it("should use cache for duplicate PlantUML diagrams", async () => {
    // Mock fetch to return a PNG buffer
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakePng });

    const plantumlCode = "class CacheTest { + test(): void }";
    const input = ["```plantuml", plantumlCode, "```"].join("\n");

    // First run - should save the file
    const output1 = await unified()
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

    // Second run with same code - should use cache
    const output2 = await unified()
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

    const htmlOutput1 = output1.toString();
    const htmlOutput2 = output2.toString();

    // Both should contain the same image URL
    const urlMatch1 = htmlOutput1.match(/src="([^"]+)"/);
    const urlMatch2 = htmlOutput2.match(/src="([^"]+)"/);

    chai.assert(urlMatch1, "First output should contain image URL");
    chai.assert(urlMatch2, "Second output should contain image URL");
    chai.assert.equal(urlMatch1[1], urlMatch2[1], "Both outputs should have the same image URL");
    chai.assert.include(urlMatch1[1], "plantuml-", "URL should contain plantuml- prefix");
  });

  it("should process ::include{file=...} directives for .puml files", async () => {
    // Mock fetch to return a PNG buffer
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = async () => ({ ok: true, buffer: async () => fakePng });

    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source-with-include-file.md")).toString();

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

  it("should send actual included file content to PlantUML server, not include directives (for !include)", async () => {
    // Mock fetch to capture the encoded content being sent
    let capturedEncodedContent = null;
    const fetchImpl = async (url) => {
      // Extract the encoded content from the URL
      const match = url.match(/plantuml\/png\/(.+)$/);
      if (match) {
        capturedEncodedContent = match[1];
      }
      return { ok: true, buffer: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
    };

    const input = fs.readFileSync(path.resolve(__dirname, "./resources/source-with-include.md")).toString();

    await remark()
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        includePath: path.resolve(__dirname, "./resources"),
        inlineSvg: false,
        fetch: fetchImpl
      })
      .process(input);

    // Verify that the encoded content was captured
    chai.assert(capturedEncodedContent, "Should have captured encoded content from fetch URL");

    // Decode the content to verify it contains the actual included file content
    const plantumlEncoder = require("plantuml-encoder");
    const decodedContent = plantumlEncoder.decode(capturedEncodedContent);

    // Should contain the actual content from included-diagram.puml, not the include directive
    chai.assert.include(decodedContent, "class IncludedDiagram", "Decoded content should contain actual included file content");
    chai.assert.include(decodedContent, "process(): void", "Decoded content should contain actual included file content");
    chai.assert.notInclude(decodedContent, "!include", "Decoded content should not contain include directives");
    chai.assert.notInclude(decodedContent, "::include", "Decoded content should not contain include directives");
  });

  it("should convert PlantUML code to inline PNG (PlantUML server URL)", async () => {
    // Mock fetch to return a PNG buffer (should not be used for inlineImage: true)
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let fetchCalled = false;
    const fetchImpl = async () => {
      fetchCalled = true;
      return { ok: true, buffer: async () => fakePng };
    };

    const input = [
      '```plantuml',
      'class InlinePngTest {',
      '  + test(): void',
      '}',
      '```'
    ].join("\n");

    const output = await remark()
      .use(plugin, {
        outputFormat: "png",
        outputDir: "./test/static",
        inlineImage: true,
        fetch: fetchImpl
      })
      .process(input);

    // Should contain an image node with a PlantUML server URL
    const outStr = output.toString();
    chai.assert.include(outStr, "![", "Should contain a markdown image node");
    chai.assert.include(outStr, "https://www.plantuml.com/plantuml/png/", "Should use PlantUML server URL for PNG");
    chai.assert.notInclude(outStr, "plantuml-", "Should not reference a local file");
    chai.assert.isFalse(fetchCalled, "Fetch should not be called when inlineImage is true");
  });
});
