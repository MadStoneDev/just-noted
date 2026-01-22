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
  createdAt: number;
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
    const { userId, notes, currentNoteId } = body as {
      userId: string;
      notes: NoteForAnalysis[];
      currentNoteId?: string;
    };

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    if (!notes || notes.length === 0) {
      return NextResponse.json({ error: "No notes provided for analysis" }, { status: 400 });
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

    // Prepare notes summary for analysis (limit content to save tokens)
    const noteSummaries = notes.slice(0, 20).map((note) => {
      // Strip HTML and limit content
      const plainText = note.content
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);

      return `[${note.title}]: ${plainText}`;
    });

    const currentNote = currentNoteId ? notes.find((n) => n.id === currentNoteId) : null;
    const currentNoteText = currentNote
      ? currentNote.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000)
      : null;

    // Create the prompt for Claude Haiku
    const systemPrompt = `You are a pattern analysis assistant for a note-taking app. Your job is to identify repetitive patterns and structures in the user's notes.

Analyze the provided notes and identify:
1. Recurring structures (weekly reports, meeting notes, daily logs, etc.)
2. Common formatting patterns
3. Repeated topics or themes
4. Similar note types that could benefit from a template

Be concise and actionable. Focus on patterns that would help the user be more productive.

Respond in JSON format:
{
  "patterns": [
    {
      "type": "structure|topic|format",
      "name": "Short pattern name",
      "description": "Brief description of the pattern",
      "frequency": "daily|weekly|occasional",
      "suggestedTemplate": "Optional: HTML template suggestion if applicable"
    }
  ],
  "similarNotes": [
    {
      "noteTitle": "Title of similar note",
      "similarity": "Brief explanation of similarity"
    }
  ],
  "suggestions": [
    "Actionable suggestion for improving note organization"
  ]
}

Keep the response concise - max 3 patterns, 3 similar notes, and 3 suggestions.`;

    const userPrompt = currentNoteText
      ? `Here are the user's recent notes:\n\n${noteSummaries.join("\n\n")}\n\nThe user is currently working on this note:\n[Current Note - ${currentNote?.title}]: ${currentNoteText}\n\nAnalyze patterns and find notes similar to the current one.`
      : `Here are the user's recent notes:\n\n${noteSummaries.join("\n\n")}\n\nAnalyze these notes for repetitive patterns and structures.`;

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
        { error: "Failed to analyze patterns. Please try again later." },
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
        patterns: [],
        similarNotes: [],
        suggestions: ["Unable to analyze patterns at this time. Please try again."],
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
