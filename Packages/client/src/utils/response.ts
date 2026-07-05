import type { ResponseFormat } from "../types";

export async function parseFormData(response: Response): Promise<FormData> {
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("multipart/form-data")) {
    const text = await response.text();
    const formData = new FormData();
    const boundary = contentType.split("boundary=")[1];
    if (boundary) {
      const parts = text.split(`--${boundary}`);
      for (const part of parts) {
        if (part.trim() && !part.includes("--\r\n")) {
          const [headerPart, bodyPart] = part.split("\r\n\r\n");
          if (headerPart && bodyPart) {
            const nameMatch = headerPart.match(/name="([^"]+)"/);
            const filenameMatch = headerPart.match(/filename="([^"]+)"/);
            if (nameMatch) {
              const name = nameMatch[1];
              if (filenameMatch) {
                const filename = filenameMatch[1];
                const contentTypeMatch = headerPart.match(/Content-Type: (.+)/);
                const type = contentTypeMatch ? contentTypeMatch[1]?.trim() : "";

                const blob = new Blob([bodyPart.slice(0, -2)], { type });
                const file = new File([blob], String(filename), { type });

                formData.append(String(name), file);
              } else {
                formData.append(String(name), bodyPart.slice(0, -2));
              }
            }
          }
        }
      }
    }
    return formData;
  }
  const text = await response.text();
  const formData = new FormData();
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    formData.append(key, value);
  }
  return formData;
}

export async function processResponse(response: Response, format: ResponseFormat = "json") {
  try {
    const contentType = response.headers.get("Content-Type") || "";

    if (
      ((format === "text" || contentType.includes("text/plain")) && format !== "blob") ||
      (contentType.includes("text/html") && format !== "blob")
    ) {
      return await response.text();
    }

    switch (format) {
      case "json":
        return await response.json().catch(() => null);
      case "formData":
        return await parseFormData(response);
      case "bytes":
        return new Uint8Array(await response.arrayBuffer());
      case "arrayBuffer":
        return await response.arrayBuffer();
      case "blob":
        return await response.blob();
      case "stream":
        return response.body;
      default:
        return await response.json().catch(() => null);
    }
  } catch (error) {
    console.error(`Error processing ${format} response:`, error);
    return null;
  }
}
