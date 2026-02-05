
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
        // DEEP SEARCH: Fetch metadata for last 1000 files to find all relevant text/pdfs in the library
        const { data: filesMeta, error: dbError } = await supabase
            .from('files')
            .select('name, storage_path, created_at')
            .eq('space_id', spaceId)
            .eq('type', 'file')
            .not('storage_path', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1000);

        if (dbError) throw dbError;

        let contextText = "";
        const pdfParts: any[] = [];

        if (filesMeta && filesMeta.length > 0) {
            // Filter for supported types (Text & PDF)
            const supportedFiles = filesMeta.filter(f =>
                f.name.match(/\.(txt|md|csv|json|js|ts|py|html|pdf)$/i)
            ).slice(0, 3); // MAX 3 FILES for Vercel Hobby Tier Limit

            console.log(`Deep Search: Found ${filesMeta.length} total files. Analyzing top ${supportedFiles.length} documents.`);

            const filePromises = supportedFiles.map(async (f) => {
                if (!f.storage_path) return;

                const isPdf = f.name.match(/\.pdf$/i);

                try {
                    // Timeout wrapper for Supabase Download
                    const downloadPromise = supabase.storage
                        .from('library_files')
                        .download(f.storage_path);

                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Timeout")), 6000)
                    );

                    const result = await Promise.race([downloadPromise, timeoutPromise]) as any;

                    if (result.error) {
                        console.error(`Error downloading ${f.name}:`, result.error);
                        return;
                    }

                    const data = result.data;

                    if (isPdf) {
                        // Convert PDF to Base64 for Gemini
                        const arrayBuffer = await data.arrayBuffer();
                        const base64Data = Buffer.from(arrayBuffer).toString("base64");
                        pdfParts.push({
                            inline_data: {
                                mime_type: "application/pdf",
                                data: base64Data
                            }
                        });
                        console.log(`Added PDF context: ${f.name}`);
                    } else {
                        // Handle Text
                        const text = await data.text();
                        // OPTIMIZATION: Reduce from 6k to 4k chars per file
                        contextText += `--- FILE: ${f.name} ---\n${text.slice(0, 4000)}\n--- END FILE ---\n`;
                    }
                } catch (err: any) {
                    console.warn(`Skipping file ${f.name}:`, err.message);
                }
            });

            await Promise.all(filePromises);
        } else {
            contextText = "No files found in library.";
        }

        // 3. Setup Gemini
        const genAI = new GoogleGenerativeAI(apiKey);

        // 4. Construct Prompt
        const systemPrompt = `
You are an advanced AI Tutor for the E-Education platform.
Your goal is to answer questions or generate quiz content based PRIMARILY on the provided Context Files (Text and PDFs).
If the context doesn't contain the answer, use your general knowledge but mention that it's not in the files.

CONTEXT SUMMARY (Text Files):
${contextText}

(Note: PDF files are attached as separate inputs for you to read)

USER PROMPT:
${prompt}

INSTRUCTIONS:
- **QUANTITY:** Generate exactly ONE question/answer pair FOR EACH image provided. If the user provided 5 images, you MUST return 5 questions.
- If the user asks a specific question, answer it directly.
- **CRITICAL: DETERMINE THE ANSWER**
  1. **VISUAL CHECK**: Does the image explicitly show the correct answer (e.g., a green checkmark, a circle, or a "Correct" label)?
     - IF YES: Use that as the correct option.
     - IF NO (Unsolved Question): **SOLVE IT** using the provided Context Files. Analyze the question text and find the matching concept in the documents.
  2. **OPTION MAPPING**:
     - Map options A, B, C, D to 1, 2, 3, 4.
     - If no labels, count the position (Top = 1).
  3. **VERIFICATION**:
     - Ensure the selected option matches the content found in your "Deep Search" of the library.
- For each question, provide:
  * A SHORT ANSWER: The specific option identifier, e.g., "Opción 1" or "Opción B".
  * A LONG ANSWER: Full explanation. **do NOT use asterisks (*). Use clean dashes (-) for lists or write in paragraphs.** Escaped newlines (\\n) are allowed.
  * THE SOURCE: The exact name of the file(s) where this information was found (e.g., "Marketing_Chapter_1.pdf").
  * IF THE INFO COMES FROM THE IMAGE ONLY: Use "Imagen proporcionada". 
  * NEVER return technical error messages like "Not available" or "Derived from image". Only "Imagen proporcionada".
- Return the response in this specific JSON format (WITHOUT markdown formatting):
[
  { 
    "q": "Question 1", 
    "shortAnswer": "Opción 2",
    "a": "Detailed explanation of why Option 2 is correct...\n\n- Point 1\n- Point 2",
    "source": "Marketing_Chapter_1.pdf"
  }
]
`;

        // 5. Generate
        let parts: any[] = [{ text: systemPrompt }];

        // Add PDFs (Context)
        if (pdfParts.length > 0) {
            parts = [...parts, ...pdfParts];
        }

        // Add User Images (Question)
        if (images && Array.isArray(images)) {
            images.forEach((img: any) => {
                parts.push(img);
            });
        }

        // Correct model names from Google AI API (with models/ prefix)
        // Gemini 2.5 has 20 req/day limit, Gemma models have higher quotas
        // Gemini 1.5 Flash is the most stable and generous tier currently
        const modelsToTry = [
            "gemini-2.0-flash",
            "gemini-2.0-flash-001",
            "gemini-2.5-flash",
            "gemini-2.0-flash-lite-preview-02-05",
            "gemini-1.5-flash",
            "gemini-1.5-flash-001",
            "gemini-1.5-pro",
            "gemini-1.5-flash-8b"
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
            let cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            // ROBUST PARSING: Find the first '[' and last ']' to ignore conversational intros
            const firstBracket = cleanText.indexOf('[');
            const lastBracket = cleanText.lastIndexOf(']');

            if (firstBracket !== -1 && lastBracket !== -1) {
                cleanText = cleanText.substring(firstBracket, lastBracket + 1);
            }

            parsedParams = JSON.parse(cleanText);
        } catch (e) {
            console.error("Failed to parse JSON:", responseText);
            // Fallback
            parsedParams = [{
                q: "Error de Formato en IA",
                a: "La inteligencia artificial generó una respuesta pero no pudimos leerla correctamente. Intenta de nuevo. \n\nRespuesta cruda: " + responseText.substring(0, 200) + "..."
            }];
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
