// React entry: the rendering components. Kept out of the package root so server
// code that only needs the builders/metadata never imports React or next/headers.
export { JsonLd } from "./json-ld.js";
export { HreflangLinks, type HreflangLinksProps } from "./hreflang.js";
