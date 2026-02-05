
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: "Missing GEMINI_API_KEY in server environment" }, { status: 500 });
    }

    const report: any = {
        key_status: "Present",
        key_preview: apiKey.substring(0, 5) + "...",
        tests: {}
    };

    try {
        // TEST 1: List Models (Direct HTTP)
        console.log("Testing: List Models...");
        const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const listData = await listResponse.json();

        if (!listResponse.ok) {
            report.tests.list_models = {
                status: "FAILED",
                http_status: listResponse.status,
                error: listData
            };
        } else {
            report.tests.list_models = {
                status: "SUCCESS",
                count: listData.models?.length || 0,
                available_models: listData.models?.map((m: any) => m.name) || []
            };
        }

        // TEST 2: Simple Generation (if listing worked or partially failed)
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent("Hello");
            report.tests.generation = {
                status: "SUCCESS",
                output: result.response.text()
            };
        } catch (genError: any) {
            report.tests.generation = {
                status: "FAILED",
                error: genError.message
            };
        }

        return NextResponse.json(report, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({
            critical_error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
