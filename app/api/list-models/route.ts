import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { apiKey } = await req.json();

        if (!apiKey) {
            return NextResponse.json(
                { error: "API Key is required." },
                { status: 400 }
            );
        }

        // Direct API call to list models
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to list models');
        }

        const data = await response.json();

        // Extract model info
        const models = data.models?.map((m: any) => ({
            name: m.name,
            displayName: m.displayName,
            description: m.description,
            supportedMethods: m.supportedGenerationMethods
        })) || [];

        return NextResponse.json({
            count: models.length,
            models: models
        });

    } catch (error: any) {
        console.error("ListModels error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to list models." },
            { status: 500 }
        );
    }
}
