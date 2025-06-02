import path from "path";

export const MAX_INPUT_JSON = process.env.MAX_INPUT_JSON || "5mb";

export const OUTPUT_FOLDER = process.env.OUTPUT_FOLDER || path.join(__dirname, "../../output");
