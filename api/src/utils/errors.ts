export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || "An unknown error occurred";
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    return JSON.stringify(error);
  }
  return "An unknown error occurred";
};
