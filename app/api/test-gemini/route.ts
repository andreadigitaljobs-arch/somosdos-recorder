
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: "Missing GEMINI_API_KEY in server environment" }, { status: 500 });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        console.log("Testing Gemini API Key with simple text...");
        const result = await model.generateContent("Say 'Hello System Working' if you can hear me.");
        const text = result.response.text();

        return NextResponse.json({
            success: true,
            message: "Gemini API is WORKING!",
            response: text,
            key_used: apiKey.substring(0, 5) + "..."
        });

    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack,
            hint: "If this is a 404, your API Key might be invalid, or the API is not enabled in Google Cloud Console."
        }, { status: 500 });
    }
}
