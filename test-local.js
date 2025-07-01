#!/usr/bin/env node

const remark = require("remark");
const plantumlLocal = require("./index");

async function testLocal() {
  console.log("Testing remark-plantuml-local locally...\n");

  const testMarkdown = `# Test Document

This is a test of the local PlantUML plugin.

\`\`\`plantuml
class TestClass {
    + test(): void
}
\`\`\`

\`\`\`plantuml
!include test/resources/included-diagram.puml

class MainClass {
    + main(): void
}
\`\`\`
`;

  try {
    // Test PNG output
    console.log("=== Testing PNG Output ===");
    const pngOutput = await remark()
      .use(plantumlLocal, {
        outputFormat: "png",
        outputDir: "./test-output",
        includePath: "./test/resources",
        inlineSvg: false
      })
      .process(testMarkdown);

    console.log("PNG Output:");
    console.log(pngOutput.toString());
    console.log("\n");

    // Test SVG inline output
    console.log("=== Testing SVG Inline Output ===");
    const svgOutput = await remark()
      .use(plantumlLocal, {
        outputFormat: "svg",
        outputDir: "./test-output",
        includePath: "./test/resources",
        inlineSvg: true
      })
      .process(testMarkdown);

    console.log("SVG Output:");
    console.log(svgOutput.toString());

    console.log("\n✅ Local testing completed successfully!");
    console.log("Check the ./test-output directory for generated images.");

  } catch (error) {
    console.error("❌ Error during local testing:", error.message);
    process.exit(1);
  }
}

testLocal();
