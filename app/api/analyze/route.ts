import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { AIAnalyst } from "@/lib/ai-analyst";

// Initialize Supabase Admin Client (for DB updates bypassing RLS if needed, or just use regular client if user context is passed)
// We need SERVICE_ROLE_KEY to insert tags globally if we enforce strict RLS, 
// OR we can use the regular auth client if we allow users to create tags.
// Let's use the standard flow: User authorizes the request.

export async function POST(req: NextRequest) {
    try {
        const { fileId } = await req.json();

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
        }

        // 1. Setup Admin Client (Service Role) to bypass RLS
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseServiceKey) {
            console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
            return NextResponse.json({ error: "Server Configuration Error: Missing DB Key" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 2. Fetch Transcript
        const { data: transcriptData, error: transcriptError } = await supabase
            .from('transcriptions')
            .select('content')
            .eq('file_id', fileId)
            .single();

        if (transcriptError || !transcriptData) {
            console.error("Transcript Fetch Error:", transcriptError);
            return NextResponse.json({ error: "Transcript not found or inaccessible" }, { status: 404 });
        }

        // 3. Run AI Analysis
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Gemini API Key missing on Server" }, { status: 500 });
        }

        const analyst = new AIAnalyst(apiKey);
        let analysis;

        try {
            analysis = await analyst.analyzeTranscript(transcriptData.content);
        } catch (aiError: any) {
            console.error("Gemini Error:", aiError);
            return NextResponse.json({ error: `AI Error: ${aiError.message}` }, { status: 500 });
        }

        // 4. Save Analysis (Structural Summary, Segments, Bookmarks)
        const { error: analysisError } = await supabase
            .from('file_analysis')
            .upsert({
                file_id: fileId,
                summary_structural: analysis.summary_structural,
                segments: analysis.segments,
                bookmarks: analysis.bookmarks,
                processed_at: new Date().toISOString()
            });

        if (analysisError) {
            console.error("DB Insert Error:", analysisError);
            return NextResponse.json({ error: `DB Error: ${analysisError.message}` }, { status: 500 });
        }

        // 5. Handle Tags (Upsert Tags -> Link File)
        const tagPromises = analysis.tags.map(async (tagName) => {
            // Simplified Tag Logic with Admin Client
            let { data: tag } = await supabase.from('tags').select('id').eq('name', tagName).single();

            if (!tag) {
                const { data: newTag } = await supabase
                    .from('tags')
                    .insert({ name: tagName })
                    .select('id')
                    .single();
                if (newTag) tag = newTag;
            }

            if (tag) {
                await supabase.from('file_tags').upsert({
                    file_id: fileId,
                    tag_id: tag.id
                }, { onConflict: 'file_id, tag_id' });
            }
        });

        await Promise.all(tagPromises);

        return NextResponse.json({ success: true, data: analysis });

    } catch (error: any) {
        console.error("Analyze API Exception:", error);
        return NextResponse.json({ error: error.message || "Unknown Server Error" }, { status: 500 });
    }
}
