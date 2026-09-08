/* Browser entry point for the STL reader. The parsing and pricing live in
   ./stl so the estimate a visitor sees in the browser is computed by exactly
   the same code that runs on the server at intake — one implementation, no
   drift between the two numbers. */
export { parseStlBytes as parseStlClient, MATERIALS, QUALITY, estimatePrint } from "./stl";
export type { StlMeta, MaterialKey, QualityKey } from "./stl";
