import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkRateLimit, getRateLimitStatus } from "@/utils/rate-limit";

const DAILY_LIMIT = 5; // 5 analyses per day per user
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours
const FEATURE_NAME = "ai-analyze";

interface NoteForAnalysis {
  id: string;
  title: string;
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = user.id;

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI features are not configured." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { note } = body as {
      note: NoteForAnalysis;
    };

    if (!note || !note.content) {
      return NextResponse.json({ error: "Note content required for analysis" }, { status: 400 });
    }

    // Check rate limit using Redis
    const rateLimit = await checkRateLimit(userId, FEATURE_NAME, DAILY_LIMIT, RATE_LIMIT_WINDOW);
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

    // Strip HTML for analysis but preserve structure
    const plainText = note.content
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

    // Limit content length for API
    const contentForAnalysis = plainText.slice(0, 4000);

    // Create the prompt for Claude Haiku - focused on pattern detection
    const systemPrompt = `You are a pattern detection assistant for a note-taking app. Your job is to find REPEATING PATTERNS within a single note.

A pattern is when the note contains multiple entries that follow the same structure/template. For example:
- A note with multiple meeting notes, each with Date, Attendees, Agenda, Notes
- A note with multiple sermon entries, each with Date, Title, Bible Reference, Preacher
- A note with multiple recipes, each with Name, Ingredients, Instructions
- A note tracking habits with Date and activities
- A journal with dated entries

Your task:
1. Identify if there's a repeating pattern/template in this note
2. Extract the field names/labels that make up each entry
3. Count how many entries/repetitions exist
4. Extract each entry's content

Respond ONLY with valid JSON in this exact format:
{
  "patternFound": boolean,
  "patternName": "Short name for the pattern (e.g., 'Sermon Notes', 'Meeting Minutes', 'Daily Log')" or null,
  "fields": ["Field1", "Field2", "Field3"] or [],
  "entryCount": number,
  "entries": [
    {
      "index": 1,
      "title": "Brief identifier for this entry (e.g., date or first field value)",
      "preview": "First 50 chars of entry content"
    }
  ],
  "template": "The template structure with field placeholders like [Field1], [Field2]" or null,
  "confidence": "high" | "medium" | "low"
}

If no clear repeating pattern is found, return:
{
  "patternFound": false,
  "patternName": null,
  "fields": [],
  "entryCount": 0,
  "entries": [],
  "template": null,
  "confidence": "low"
}

Be strict about pattern detection - only return patternFound: true if there are at least 2 entries following the same structure.`;

    const userPrompt = `Analyze this note for repeating patterns:\n\n${contentForAnalysis}`;

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
        max_tokens: 2048,
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
      // If parsing fails, return no pattern found
      console.error("Failed to parse AI response:", assistantMessage);
      analysis = {
        patternFound: false,
        patternName: null,
        fields: [],
        entryCount: 0,
        entries: [],
        template: null,
        confidence: "low",
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
  // Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const userId = user.id;

  // Get rate limit status from Redis
  const status = await getRateLimitStatus(userId, FEATURE_NAME, DAILY_LIMIT, RATE_LIMIT_WINDOW);

  return NextResponse.json({
    remaining: status.remaining,
    limit: DAILY_LIMIT,
    resetAt: status.resetAt,
  });
}
