import { GoogleGenerativeAI } from "@google/generative-ai";

// Schema definitions for type safety
export interface AnalysisResult {
    summary_structural: string;
    segments: Array<{
        start: number;
        end: number;
        title: string;
    }>;
    bookmarks: Array<{
        time: number;
        label: string;
        type: 'definition' | 'warning' | 'key_idea' | 'example' | 'evaluable';
        content?: string;
    }>;
    tags: string[];
}

const SYSTEM_PROMPT = `
You are an expert Knowledge Structuring Engine. Your task is to analyze the provided transcript and extract structured metadata.
You must NOT be conversational. You must NOT emit opinions. Only output raw, structured data.

### OBJECTIVES:

1. **STRUCTURAL SUMMARY**: Create a dry, high-level summary of the topics covered. Use "Business Casual" tone. No "In this video...". Just the facts.
2. **INTELLIGENT SEGMENTATION**: Divide the content into logical blocks (themes).
3. **AUTOMATED BOOKMARKS**: Detect specific types of content:
   - "definition": When a term is clearly defined.
   - "warning": Cautions, common mistakes, or risks mentioned.
   - "key_idea": Core concepts or principles.
   - "example": Concrete examples or case studies.
   - "evaluable": Content likely to appear in an exam (lists, specific processes, named theories).
4. **AUTO-TAGGING**: Assign 3-5 high-level tags (e.g., "Marketing Digital", "SEO", "Sales Psychology").

### INPUT FORMAT:
Transcript text with timestamps if available, or just text.

### OUTPUT FORMAT:
Return strictly a JSON object with this structure:
{
  "summary_structural": "string",
  "segments": [ {"start": 0, "end": 120, "title": "Topic A"} ], // Timestamps in seconds (approximate if text doesn't have them, use word count/150 words per min as fallback or 0)
  "bookmarks": [ {"time": 45, "label": "Definition of ROI", "type": "definition"} ],
  "tags": ["Tag1", "Tag2"]
}

### CRITICAL RULES:
- Output VALID JSON only. No markdown formatting (no \`\`\`json).
- If timestamps are missing in input, estimate based on text length (avg 150 words/min) or return 0.
- Labels must be short (3-6 words).
- Summary should be 1-2 paragraphs max.
`;

export class AIAnalyst {
    private genAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async analyzeTranscript(text: string): Promise<AnalysisResult> {
        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `
${SYSTEM_PROMPT}

--- TRANSCRIPT START ---
${text.slice(0, 50000)} 
--- TRANSCRIPT END ---
(Note: Text truncated to 50k chars for efficiency if needed)
`;

        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            // Clean formatting just in case
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            return JSON.parse(cleanJson) as AnalysisResult;
        } catch (error) {
            console.error("AI Analysis Failed:", error);
            throw new Error("Failed to analyze transcript");
        }
    }
}
