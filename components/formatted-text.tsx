import { cn } from "@/lib/utils"

interface FormattedTextProps {
    text: string
    className?: string
}

export function FormattedText({ text, className }: FormattedTextProps) {
    if (!text) return null

    // Split by newlines to handle paragraphs
    const paragraphs = text.split('\n').filter(p => p.trim() !== "")

    return (
        <div className={cn("space-y-4 text-sm leading-relaxed text-foreground/90", className)}>
            {paragraphs.map((paragraph, i) => {
                // Check if it's a list item (starts with * or - or 1.)
                const isBullet = /^\s*[\*\-]\s+/.test(paragraph)
                const isOrdered = /^\s*\d+\.\s+/.test(paragraph)

                // Process bolding **text**
                const parts = paragraph.split(/(\*\*.*?\*\*)/g).map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={j} className="font-bold text-primary/90">{part.slice(2, -2)}</strong>
                    }
                    return part
                })

                if (isBullet || isOrdered) {
                    return (
                        <div key={i} className="pl-4 relative">
                            <span className="absolute left-0 top-0 opacity-50">•</span>
                            <p className="pl-2">{parts}</p>
                        </div>
                    )
                }

                return <p key={i}>{parts}</p>
            })}
        </div>
    )
}
