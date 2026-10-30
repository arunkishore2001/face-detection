// Builds the face grouping tree off the main thread so the page stays responsive.
import { buildTree } from "./cluster.js";

self.onmessage = ({ data }) => self.postMessage(buildTree(data.embeddings));
