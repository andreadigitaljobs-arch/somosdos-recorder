
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
    let tempFilePath = "";

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const apiKey = formData.get("apiKey") as string;
        const prompt = formData.get("prompt") as string || "Generate a comprehensive transcription of this audio/video. Include speaker labels if possible.";

        if (!file || !apiKey) {
            return NextResponse.json(
                { error: "File and API Key are required." },
                { status: 400 }
            );
        }

        // Initialize Gemini Clients
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GoogleAIFileManager(apiKey);

        // Save file temporarily to disk (GoogleAIFileManager requires a path)
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create a safe temp filename
        const tempDir = os.tmpdir();
        const fileName = `upload-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        tempFilePath = path.join(tempDir, fileName);

        await writeFile(tempFilePath, buffer);
        console.log("File saved to temp:", tempFilePath);

        // 1. Upload to Gemini
        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
            mimeType: file.type || "video/mp4",
            displayName: file.name,
        });
        console.log("Uploaded to Gemini:", uploadResponse.file.uri);

        // 2. Poll for processing (Active) state
        let fileRecord = await fileManager.getFile(uploadResponse.file.name);
        while (fileRecord.state === FileState.PROCESSING) {
            console.log("Processing file...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
            fileRecord = await fileManager.getFile(uploadResponse.file.name);
        }

        if (fileRecord.state === FileState.FAILED) {
            throw new Error("Video processing failed.");
        }

        console.log("File is active. Generating content...");

        // 3. Generate Content with Fallback
        // Gemma models have higher free quota than Gemini 2.5
        const modelsToTry = [
            "models/gemini-2.5-flash",
            "models/gemini-2.0-flash",
            "models/gemma-3-27b-it",
            "models/gemma-3-12b-it",
            "models/gemma-3-4b-it",
            "models/gemini-flash-latest",
            "models/gemini-pro-latest"
        ];

        let result = null;
        const attemptErrors = [];

        for (const modelName of modelsToTry) {
            try {
                console.log(`Attempting transcription with model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });

                result = await model.generateContent([
                    prompt,
                    {
                        fileData: {
                            fileUri: uploadResponse.file.uri,
                            mimeType: uploadResponse.file.mimeType,
                        },
                    },
                ]);

                if (result && result.response) {
                    console.log(`Success with model: ${modelName}`);
                    break;
                }
            } catch (e: unknown) {
                const err = e as Error;
                console.warn(`Failed with model ${modelName}:`, err.message);
                attemptErrors.push(`${modelName}: ${err.message}`);
            }
        }

        if (!result) {
            const errorSummary = attemptErrors.join(" | ");
            throw new Error(`All models failed. Details: ${errorSummary}`);
        }

        const text = result.response.text();

        // Challenge: Deleting the file from Gemini? 
        // Usually good practice to clean up remote files too, but maybe user wants to reuse?
        // For now, let's just clean up local.

        return NextResponse.json({ transcription: text });

    } catch (error: unknown) {
        const e = error as Error;
        console.error("Transcription error:", error);
        return NextResponse.json(
            { error: e.message || "Failed to transcribe." },
            { status: 500 }
        );
    } finally {
        // Clean up local temp file
        if (tempFilePath) {
            try {
                await unlink(tempFilePath);
                console.log("Cleaned up temp file:", tempFilePath);
            } catch (e) {
                console.error("Failed to cleanup temp file:", e);
            }
        }
    }
}
