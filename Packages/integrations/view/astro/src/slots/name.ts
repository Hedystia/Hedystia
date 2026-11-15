/** Normalize Astro slot names consistently between server and client props. */
export function slotName(name: string): string {
  return name.trim().replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
}
