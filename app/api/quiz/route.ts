
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
    try {
        const { prompt, spaceId, images, apiKey } = await req.json();

        if (!spaceId || !apiKey) {
            return NextResponse.json(
                { error: "Space ID and API Key are required." },
                { status: 400 }
            );
        }

        // 1. Setup Supabase (Server-side) with User Token
        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: "Unauthorized: Missing Logged In User Token" }, { status: 401 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        // Create client with user's access token to respect RLS
        const supabase = createClient(supabaseUrl, supabaseKey, {
            global: {
                headers: { Authorization: `Bearer ${token}` }
            }
        });

        // 2. Fetch relevant files context
        // Query files in this space. For simplicity, we'll fetch text files.
        // In a real app, you'd use RAG (Embeddings), but for now we'll naively fetch recent text files.
        const { data: files, error: dbError } = await supabase
            .from('files')
            .select('name, storage_path')
            .eq('space_id', spaceId)
            .eq('type', 'file')
            .not('storage_path', 'is', null) // Ensure paths exist
            .limit(5); // Limit context to avoid token limits for this demo

        if (dbError) throw dbError;

        let contextText = "";
        if (files && files.length > 0) {
            console.log(`Found ${files.length} files for context.`);

            // Download content for each file
            const filePromises = files.map(async (f) => {
                if (!f.storage_path) return "";

                // Only try to read text-ish files to avoid binary garbage
                // Ideally backend checks mime type, here we check extension
                const isText = f.name.match(/\.(txt|md|csv|json|js|ts|py|html)$/i);
                if (!isText) return `[File: ${f.name} - Skipped (Not text)]`;

                const { data, error } = await supabase.storage
                    .from('library_files')
                    .download(f.storage_path);

                if (error) {
                    console.error(`Error downloading ${f.name}:`, error);
                    return "";
                }

                const text = await data.text();
                return `--- FILE: ${f.name} ---\n${text.slice(0, 5000)}\n--- END FILE ---\n`; // Truncate individual files
            });

            const fileContents = await Promise.all(filePromises);
            contextText = fileContents.join("\n");
        } else {
            contextText = "No files found in library.";
        }

        // 3. Setup Gemini & Model Fallback Strategy
        const genAI = new GoogleGenerativeAI(apiKey);

        // 4. Construct Prompt
        const systemPrompt = `
You are an advanced AI Tutor for the E-Education platform.
Your goal is to answer questions or generate quiz content based PRIMARILY on the provided Context Files.
If the context doesn't contain the answer, use your general knowledge but mention that it's not in the files.

CONTEXT FILES:
${contextText}

USER PROMPT:
${prompt}

INSTRUCTIONS:
- Generate 1-3 distinct questions/answers pairs if the user asks for a quiz.
- If the user asks a specific question, answer it directly.
- Return the response in this specific JSON format (WITHOUT markdown formatting):
[
  { "q": "Question 1", "a": "Answer 1" },
  { "q": "Question 2", "a": "Answer 2" }
]
`;

        // 5. Generate
        let parts: any[] = [{ text: systemPrompt }];

        // If frontend sends images (base64), add them here:
        if (images && Array.isArray(images)) {
            images.forEach((img: any) => {
                parts.push(img);
            });
        }

        // Correct model names from Google AI API (with models/ prefix)
        // Gemini 2.5 has 20 req/day limit, Gemma models have higher quotas
        const modelsToTry = [
            "models/gemini-2.5-flash",
            "models/gemini-2.0-flash",
            "models/gemma-3-27b-it",      // Open-source, higher quota
            "models/gemma-3-12b-it",      // Smaller, faster
            "models/gemma-3-4b-it",       // Fastest
            "models/gemini-flash-latest",
            "models/gemini-pro-latest"
        ];

        let result = null;
        const attemptErrors = [];

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting to generate with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });

                result = await model.generateContent(parts);
                if (result && result.response) {
                    console.log(`Success with model: ${modelName}`);
                    break;
                }
            } catch (e: any) {
                console.warn(`Failed with model ${modelName}:`, e.message);
                attemptErrors.push(`${modelName}: ${e.message}`);
                continue;
            }
        }

        if (!result) {
            const errorSummary = attemptErrors.join(" | ");
            throw new Error(`All models failed. Details: ${errorSummary}`);
        }

        const responseText = result.response.text();

        // 6. Parse JSON safely
        let parsedParams = [];
        try {
            // Clean markdown blocks if Gemini adds them
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            parsedParams = JSON.parse(cleanText);
        } catch (e) {
            console.error("Failed to parse JSON:", responseText);
            // Fallback
            parsedParams = [{ q: "Error parsing AI response", a: responseText }];
        }

        return NextResponse.json({ results: parsedParams });

    } catch (error: any) {
        console.error("Quiz API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
