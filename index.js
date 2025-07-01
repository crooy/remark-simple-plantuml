const visit = require("unist-util-visit");
const plantumlEncoder = require("plantuml-encoder");
const fs = require("fs-extra");
const path = require("path");

const DEFAULT_OPTIONS = {
  baseUrl: "https://www.plantuml.com/plantuml",
  outputFormat: "png", // "png" or "svg"
  outputDir: "./static", // Directory to store generated images
  inlineSvg: true, // Whether to inline SVG content
  includePath: "./" // Base path for resolving included .puml files
};

/**
 * Fetches PlantUML diagram and returns the image data
 * @param {string} plantumlCode - The PlantUML code
 * @param {Object} options - Plugin options
 * @returns {Promise<Buffer>} - Image data as buffer
 */
async function fetchPlantUMLImage(plantumlCode, options) {
  const encoded = plantumlEncoder.encode(plantumlCode);
  const url = `${options.baseUrl}/${options.outputFormat}/${encoded}`;

  try {
    const fetchImpl = options.fetch || require("node-fetch");
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PlantUML image: ${response.status} ${response.statusText}`);
    }
    return await response.buffer();
  } catch (error) {
    console.error(`Error fetching PlantUML image: ${error.message}`);
    throw error;
  }
}

/**
 * Processes include directives in PlantUML code
 * @param {string} plantumlCode - The PlantUML code
 * @param {string} basePath - Base path for resolving includes
 * @returns {Promise<string>} - Processed PlantUML code
 */
async function processIncludes(plantumlCode, basePath) {
  const includeRegex = /!include\s+(.+)$/gm;
  let processedCode = plantumlCode;
  let match;

  while ((match = includeRegex.exec(plantumlCode)) !== null) {
    const includePath = match[1].trim();

    // Check if it's a .puml file
    if (includePath.endsWith(".puml")) {
      try {
        const fullPath = path.resolve(basePath, includePath);
        const includedContent = await fs.readFile(fullPath, "utf8");

        // Recursively process includes in the included file
        const processedIncludedContent = await processIncludes(includedContent, path.dirname(fullPath));

        // Replace the include directive with the file content
        processedCode = processedCode.replace(match[0], processedIncludedContent);
        console.log(`📄 PlantUML include processed: ${includePath}`);
      } catch (error) {
        console.error(`Error processing include ${includePath}: ${error.message}`);
        // Keep the original include directive if file can't be read
      }
    }
  }

  return processedCode;
}

/**
 * Saves image data to file and returns the file path
 * @param {Buffer} imageData - Image data as buffer
 * @param {string} outputDir - Output directory
 * @param {string} format - Image format (png/svg)
 * @param {string} encodedCode - Encoded PlantUML code for filename
 * @returns {Promise<string>} - File path
 */
async function saveImageToFile(imageData, outputDir, format, encodedCode) {
  await fs.ensureDir(outputDir);
  const filename = `plantuml-${encodedCode.substring(0, 8)}.${format}`;
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, imageData);
  console.log(`📁 PlantUML diagram saved: ${filePath} (${(imageData.length / 1024).toFixed(1)} KB)`);
  // Return a relative path with leading './' for markdown compatibility
  return `./${path.join(outputDir, filename)}`;
}

/**
 * Creates an inline SVG node from SVG content
 * @param {string} svgContent - SVG content as string
 * @param {string} alt - Alt text
 * @returns {Object} - AST node for inline SVG
 */
function createInlineSvgNode(svgContent, alt) {
  const titleAttr = alt ? ` title="${alt}"` : "";
  return {
    type: "html",
    value: `<div class="plantuml-diagram"${titleAttr}>${svgContent}</div>`
  };
}

/**
 * Plugin for remark-js
 *
 * See details about plugin API:
 * https://github.com/unifiedjs/unified#plugin
 *
 * @param {Object} pluginOptions Remark plugin options.
 */
function remarkSimplePlantumlPlugin(pluginOptions) {
  const options = { ...DEFAULT_OPTIONS, ...pluginOptions };

  return async function transformer(syntaxTree) {
    const promises = [];

    visit(syntaxTree, "code", (node, index, parent) => {
      let { lang, value, meta } = node;
      if (!lang || !value || lang !== "plantuml") return;

      // Process includes in PlantUML code
      const processPromise = processIncludes(value, options.includePath).then(async processedCode => {
        try {
          // Fetch the image
          const imageData = await fetchPlantUMLImage(processedCode, options);

          if (options.outputFormat === "svg" && options.inlineSvg) {
            // Create inline SVG node
            const svgContent = imageData.toString("utf8");
            const newNode = createInlineSvgNode(svgContent, meta);
            parent.children[index] = newNode;
            console.log(`🎨 PlantUML SVG inlined (${(svgContent.length / 1024).toFixed(1)} KB)`);
          } else {
            // Save to file and create image node
            const encoded = plantumlEncoder.encode(processedCode);
            const filePath = await saveImageToFile(imageData, options.outputDir, options.outputFormat, encoded);

            // Create image node directly (no paragraph wrapper needed for remark-rehype)
            const imageNode = {
              type: "image",
              url: filePath.startsWith("./") ? filePath.replace(/^\./, "") : filePath,
              alt: meta,
              title: meta
            };

            parent.children[index] = imageNode;

            // Debug: log the node structure
            console.log("DEBUG - Created node:", JSON.stringify(imageNode, null, 2));
          }
        } catch (error) {
          console.error(`Error processing PlantUML code: ${error.message}`);
          // On error, insert a link to the PlantUML image with encoded content
          const encoded = plantumlEncoder.encode(processedCode);
          const imageUrl = `${options.baseUrl}/${options.outputFormat}/${encoded}`;
          const linkNode = {
            type: "paragraph",
            children: [
              {
                type: "link",
                url: imageUrl,
                title: meta,
                children: [
                  { type: "text", value: meta || "PlantUML diagram" }
                ]
              }
            ]
          };
          parent.children[index] = linkNode;
        }
      });

      promises.push(processPromise);
    });

    // Wait for all async operations to complete
    if (promises.length > 0) {
      await Promise.all(promises);
    }

    return syntaxTree;
  };
}

module.exports = remarkSimplePlantumlPlugin;
