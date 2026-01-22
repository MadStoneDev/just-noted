import { NextRequest, NextResponse } from "next/server";

// Rate limiting storage (in production, use Redis or database)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const DAILY_LIMIT = 5; // 5 analyses per day per user
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    // Reset or initialize
    rateLimitStore.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: DAILY_LIMIT - 1, resetAt: now + RATE_LIMIT_WINDOW };
  }

  if (userLimit.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: userLimit.resetAt };
  }

  userLimit.count++;
  return { allowed: true, remaining: DAILY_LIMIT - userLimit.count, resetAt: userLimit.resetAt };
}

interface NoteForAnalysis {
  id: string;
  title: string;
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI features are not configured. Please add ANTHROPIC_API_KEY to environment variables." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { userId, note } = body as {
      userId: string;
      note: NoteForAnalysis;
    };

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    if (!note || !note.content) {
      return NextResponse.json({ error: "Note content required for analysis" }, { status: 400 });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / (60 * 60 * 1000));
      return NextResponse.json(
        {
          error: `Daily AI analysis limit reached (${DAILY_LIMIT}/day). Resets in ${resetIn} hours.`,
          rateLimitExceeded: true,
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

    // Strip HTML for analysis but preserve structure hints
    const plainText = note.content
      .replace(/<h[1-6][^>]*>/gi, "\n[HEADING] ")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<ul[^>]*data-type="taskList"[^>]*>/gi, "\n[CHECKLIST]\n")
      .replace(/<input[^>]*checked[^>]*>/gi, "[x] ")
      .replace(/<input[^>]*type="checkbox"[^>]*>/gi, "[ ] ")
      .replace(/<blockquote[^>]*>/gi, "\n[QUOTE] ")
      .replace(/<code[^>]*>/gi, "[CODE]")
      .replace(/<\/code>/gi, "[/CODE]")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Limit content length for API
    const contentForAnalysis = plainText.slice(0, 3000);

    // Create the prompt for Claude Haiku - focused on single note analysis
    const systemPrompt = `You are a writing assistant for a note-taking app. Analyze THIS SINGLE NOTE for patterns, structure, and provide helpful suggestions.

Focus on:
1. Structural patterns within the note (repeated sections, consistent formatting)
2. Content organization and flow
3. Potential improvements for clarity or structure
4. Whether this note could become a reusable template

Be concise, friendly, and actionable. This is for a single note, not comparing multiple notes.

Respond in JSON format:
{
  "structure": {
    "type": "list|outline|freeform|mixed",
    "hasHeadings": boolean,
    "hasChecklists": boolean,
    "hasCodeBlocks": boolean,
    "estimatedReadTime": "X min"
  },
  "patterns": [
    {
      "name": "Short pattern name",
      "description": "What you noticed",
      "suggestion": "How to improve or use this pattern"
    }
  ],
  "improvements": [
    "Specific, actionable suggestion for this note"
  ],
  "templatePotential": {
    "isGoodTemplate": boolean,
    "templateName": "Suggested name if applicable",
    "reason": "Why or why not"
  },
  "summary": "One sentence summary of what this note is about"
}

Keep responses concise - max 3 patterns and 3 improvements.`;

    const userPrompt = `Analyze this note titled "${note.title}":\n\n${contentForAnalysis}`;

    // Call Claude Haiku API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
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
      const errorData = await response.json().catch(() => ({}));
      console.error("Anthropic API error:", errorData);
      return NextResponse.json(
        { error: "Failed to analyze note. Please try again later." },
        { status: 500 }
      );
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || "";

    // Parse the JSON response
    let analysis;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = assistantMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      // If parsing fails, return a structured error
      console.error("Failed to parse AI response:", assistantMessage);
      analysis = {
        structure: { type: "unknown", hasHeadings: false, hasChecklists: false, hasCodeBlocks: false },
        patterns: [],
        improvements: ["Unable to analyze this note at the moment. Please try again."],
        templatePotential: { isGoodTemplate: false, reason: "Analysis failed" },
        summary: "Unable to generate summary",
      };
    }

    return NextResponse.json({
      success: true,
      analysis,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.resetAt,
    });
  } catch (error) {
    console.error("AI analysis error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during analysis" },
      { status: 500 }
    );
  }
}

// GET endpoint to check rate limit status
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    return NextResponse.json({
      remaining: DAILY_LIMIT,
      limit: DAILY_LIMIT,
      resetAt: now + RATE_LIMIT_WINDOW,
    });
  }

  return NextResponse.json({
    remaining: Math.max(0, DAILY_LIMIT - userLimit.count),
    limit: DAILY_LIMIT,
    resetAt: userLimit.resetAt,
  });
}
