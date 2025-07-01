const visit = require("unist-util-visit");
const plantumlEncoder = require("plantuml-encoder");
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_OPTIONS = {
  baseUrl: "https://www.plantuml.com/plantuml",
  outputFormat: "png", // "png" or "svg"
  outputDir: "./static", // Directory to store generated images
  inlineSvg: true, // Whether to inline SVG content
  includePath: "./", // Base path for resolving included .puml files
  urlPrefix: "/" // URL prefix to replace "./" in generated image URLs
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
  let processedCode = plantumlCode;

  console.log("Processing includes in:", plantumlCode);

  // Process !include directives
  const includeRegex = /!include\s+(.+)$/gm;
  let match;

  while ((match = includeRegex.exec(plantumlCode)) !== null) {
    const includePath = match[1].trim();

    // Check if it's a .puml file
    if (includePath.endsWith(".puml")) {
      try {
        const fullPath = path.resolve(basePath, includePath);
        const includedContent = await fs.readFile(fullPath, "utf8");
        console.log("Included content:", includedContent);

        // Recursively process includes in the included file
        const processedIncludedContent = await processIncludes(includedContent, path.dirname(fullPath));

        // Clean @startuml and @enduml directives from included content
        const cleanedContent = processedIncludedContent
          .replace(/^\s*@startuml\s*$/gm, "") // Remove @startuml lines
          .replace(/^\s*@enduml\s*$/gm, "") // Remove @enduml lines
          .trim(); // Remove extra whitespace

        // Replace the include directive with the cleaned file content
        processedCode = processedCode.replace(match[0], cleanedContent);
        console.log(`📄 PlantUML include processed: ${includePath}`);
        console.log("Processed code:", processedCode);
      } catch (error) {
        console.error(`Error processing include ${includePath}: ${error.message}`);
        // Keep the original include directive if file can't be read
      }
    }
  }

  // Process ::include{file=...} directives
  const includeFileRegex = /::include\{file=([^}]+)\}/gm;

  while ((match = includeFileRegex.exec(processedCode)) !== null) {
    const includePath = match[1].trim();

    // Check if it's a .puml file
    if (includePath.endsWith(".puml")) {
      try {
        const fullPath = path.resolve(basePath, includePath);
        const includedContent = await fs.readFile(fullPath, "utf8");

        // Recursively process includes in the included file
        const processedIncludedContent = await processIncludes(includedContent, path.dirname(fullPath));

        // Clean @startuml and @enduml directives from included content
        const cleanedContent = processedIncludedContent
          .replace(/^\s*@startuml\s*$/gm, "") // Remove @startuml lines
          .replace(/^\s*@enduml\s*$/gm, "") // Remove @enduml lines
          .trim(); // Remove extra whitespace

        // Replace the include directive with the cleaned file content
        processedCode = processedCode.replace(match[0], cleanedContent);
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
 * Generates a SHA-256 hash from PlantUML code
 * @param {string} plantumlCode - The PlantUML code
 * @returns {string} - SHA-256 hash (hex string)
 */
function generateHash(plantumlCode) {
  return crypto
    .createHash("sha256")
    .update(plantumlCode, "utf8")
    .digest("hex");
}

/**
 * Saves image data to file and returns the filename
 * @param {Buffer} imageData - Image data as buffer
 * @param {string} outputDir - Output directory
 * @param {string} format - Image format (png/svg)
 * @param {string} plantumlCode - The PlantUML code for hash generation
 * @returns {Promise<string>} - Filename only
 */
async function saveImageToFile(imageData, outputDir, format, plantumlCode) {
  await fs.ensureDir(outputDir);
  const hash = generateHash(plantumlCode);
  const filename = `plantuml-${hash}.${format}`;
  const filePath = path.join(outputDir, filename);

  // Check if file already exists (cache check)
  console.log(`🔍 Checking cache for: ${filename}`);
  if (await fs.pathExists(filePath)) {
    console.log(`✅ Cache hit! Using existing file: ${filePath}`);
    return filename;
  }

  await fs.writeFile(filePath, imageData);
  console.log(`📁 PlantUML diagram saved: ${filePath} (${(imageData.length / 1024).toFixed(1)} KB)`);
  return filename;
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
            const filename = await saveImageToFile(imageData, options.outputDir, options.outputFormat, processedCode);

            // Construct the URL as urlPrefix + filename, ensuring no double slashes
            let url = options.urlPrefix.endsWith("/") ? options.urlPrefix : options.urlPrefix + "/";
            url += filename;
            url = url.replace(/\/\/+/, "/"); // Replace any double slashes with a single slash

            const imageNode = {
              type: "image",
              url,
              alt: meta,
              title: meta
            };

            parent.children[index] = imageNode;

            // Debug: log the node structure
            console.log("DEBUG - Created node:", JSON.stringify(imageNode, null, 2));
          }
        } catch (error) {
          console.error(`Error processing PlantUML code: ${error.message}`);
          // On error, insert an image node with the PlantUML image URL as src
          const encoded = plantumlEncoder.encode(processedCode);
          const imageUrl = `${options.baseUrl}/${options.outputFormat}/${encoded}`;
          const imageNode = {
            type: "image",
            url: imageUrl,
            alt: meta,
            title: meta
          };
          parent.children[index] = imageNode;
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
