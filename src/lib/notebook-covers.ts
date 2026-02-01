import { CoverType } from "@/types/notebook";

// Predefined solid colors for notebook covers
export const COVER_COLORS = [
  // Row 1 - Vibrant
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#14b8a6", // Teal
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  // Row 2 - Muted/Dark
  "#dc2626", // Dark Red
  "#ea580c", // Dark Orange
  "#ca8a04", // Dark Yellow
  "#16a34a", // Dark Green
  "#0d9488", // Dark Teal
  "#2563eb", // Dark Blue
  "#7c3aed", // Dark Violet
  "#db2777", // Dark Pink
  // Row 3 - Neutrals
  "#6b7280", // Gray
  "#4b5563", // Dark Gray
  "#374151", // Darker Gray
  "#1f2937", // Almost Black
  "#78716c", // Stone
  "#57534e", // Warm Gray
  "#44403c", // Brown Gray
  "#292524", // Near Black
];

// Predefined gradients for notebook covers
export const COVER_GRADIENTS = [
  { name: "sunset", value: "linear-gradient(135deg, #f97316, #ec4899)" },
  { name: "ocean", value: "linear-gradient(135deg, #3b82f6, #14b8a6)" },
  { name: "forest", value: "linear-gradient(135deg, #22c55e, #14b8a6)" },
  { name: "twilight", value: "linear-gradient(135deg, #8b5cf6, #ec4899)" },
  { name: "sunrise", value: "linear-gradient(135deg, #eab308, #f97316)" },
  { name: "midnight", value: "linear-gradient(135deg, #1f2937, #4b5563)" },
  { name: "berry", value: "linear-gradient(135deg, #ec4899, #8b5cf6)" },
  { name: "mint", value: "linear-gradient(135deg, #14b8a6, #22c55e)" },
  { name: "fire", value: "linear-gradient(135deg, #ef4444, #f97316)" },
  { name: "ice", value: "linear-gradient(135deg, #3b82f6, #8b5cf6)" },
  { name: "earth", value: "linear-gradient(135deg, #78716c, #57534e)" },
  { name: "aurora", value: "linear-gradient(135deg, #22c55e, #8b5cf6)" },
];

// Stock photos/images for notebook covers (in public/covers/)
export const COVER_PHOTOS = [
  { name: "mountains", path: "/covers/mountains.svg" },
  { name: "forest", path: "/covers/forest.svg" },
  { name: "ocean", path: "/covers/ocean.svg" },
  { name: "stars", path: "/covers/stars.svg" },
  { name: "abstract", path: "/covers/abstract.svg" },
  { name: "books", path: "/covers/books.svg" },
  { name: "desk", path: "/covers/desk.svg" },
  { name: "coffee", path: "/covers/coffee.svg" },
];

// Default cover values
export const DEFAULT_COVER_TYPE: CoverType = "color";
export const DEFAULT_COVER_VALUE = "#6366f1"; // Indigo

// Helper to get CSS background style from cover type and value
export function getCoverStyle(
  coverType: CoverType,
  coverValue: string,
): React.CSSProperties {
  switch (coverType) {
    case "color":
      return { backgroundColor: coverValue };
    case "gradient":
      return { background: coverValue };
    case "photo":
    case "custom":
      return {
        backgroundImage: `url(${coverValue})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    default:
      return { backgroundColor: DEFAULT_COVER_VALUE };
  }
}

// Helper to get a preview color from any cover type (for indicators/dots)
export function getCoverPreviewColor(
  coverType: CoverType,
  coverValue: string,
): string {
  switch (coverType) {
    case "color":
      return coverValue;
    case "gradient":
      // Extract first color from gradient
      const match = coverValue.match(/#[a-fA-F0-9]{6}/);
      return match ? match[0] : DEFAULT_COVER_VALUE;
    case "photo":
    case "custom":
      // Return a neutral color for photos
      return "#6b7280";
    default:
      return DEFAULT_COVER_VALUE;
  }
}

// Validate cover type
export function isValidCoverType(type: string): type is CoverType {
  return ["color", "gradient", "photo", "custom"].includes(type);
}

// Validate cover value based on type
export function isValidCoverValue(type: CoverType, value: string): boolean {
  if (!value) return false;

  switch (type) {
    case "color":
      return /^#[a-fA-F0-9]{6}$/.test(value);
    case "gradient":
      return value.startsWith("linear-gradient");
    case "photo":
      return value.startsWith("/covers/") && (value.endsWith(".jpg") || value.endsWith(".svg"));
    case "custom":
      return value.startsWith("http") || value.startsWith("/");
    default:
      return false;
  }
}
