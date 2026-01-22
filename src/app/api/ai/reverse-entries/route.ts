import { NextRequest, NextResponse } from "next/server";

// Rate limiting storage (shared concept with analyze-patterns)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const DAILY_LIMIT = 5;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000;

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitStore.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }

  if (userLimit.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: userLimit.resetAt };
  }

  userLimit.count++;
  return { allowed: true, remaining: DAILY_LIMIT - userLimit.count, resetAt: userLimit.resetAt };
}

interface ReverseRequest {
  userId: string;
  noteContent: string;
  patternName: string;
  entryCount: number;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI features are not configured." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { userId, noteContent, patternName, entryCount } = body as ReverseRequest;

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    if (!noteContent) {
      return NextResponse.json({ error: "Note content required" }, { status: 400 });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Daily limit reached. Try again tomorrow.",
          rateLimitExceeded: true,
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

    // Strip HTML for analysis but preserve structure
    const plainText = noteContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<h[1-6][^>]*>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const contentForAnalysis = plainText.slice(0, 6000);

    const systemPrompt = `You are a text manipulation assistant. Your task is to REVERSE the order of repeating entries in a note while preserving any content that comes before or after the entries.

IMPORTANT RULES:
1. Identify the ${entryCount} repeating entries (pattern: "${patternName || "repeating structure"}")
2. REVERSE their order (first becomes last, last becomes first)
3. PRESERVE any content that appears BEFORE the first entry or AFTER the last entry
4. Keep the exact formatting and content of each entry - only change their order
5. Do NOT add, remove, or modify any text - only reorder the entries

Return ONLY the reversed content as plain text. Do not include any explanations or markdown formatting.`;

    const userPrompt = `Reverse the order of the repeating entries in this note:\n\n${contentForAnalysis}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error");
      return NextResponse.json(
        { error: "Failed to reverse entries. Please try again." },
        { status: 500 }
      );
    }

    const data = await response.json();
    const reversedContent = data.content?.[0]?.text || "";

    if (!reversedContent) {
      return NextResponse.json(
        { error: "Failed to generate reversed content." },
        { status: 500 }
      );
    }

    // Convert plain text back to basic HTML paragraphs
    const htmlContent = reversedContent
      .split("\n\n")
      .map((para: string) => {
        if (para.trim()) {
          // Preserve single line breaks within paragraphs
          const withBreaks = para.replace(/\n/g, "<br>");
          return `<p>${withBreaks}</p>`;
        }
        return "";
      })
      .filter(Boolean)
      .join("");

    return NextResponse.json({
      success: true,
      reversedContent: htmlContent,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.resetAt,
    });
  } catch (error) {
    console.error("Reverse entries error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
