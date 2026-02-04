"use client"

import { useState, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Image as ImageIcon, Sparkles, RefreshCw, Trash, Brain } from "lucide-react"
import { motion } from "framer-motion"
import { useSpace } from "@/components/providers/space-provider"
import { createBrowserClient } from "@supabase/ssr"

export default function QuizPage() {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const [images, setImages] = useState<File[]>([])
    const [context, setContext] = useState("")
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
    const { currentSpace } = useSpace()

    // Reset state when space changes
    useEffect(() => {
        setImages([])
        setContext("")
        setResults([])
    }, [currentSpace])

    // Handle paste from clipboard
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items
            if (!items) return

            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile()
                    if (file) {
                        setImages(prev => [...prev, file])
                        // Optional: show toast notification
                        console.log('✅ Imagen pegada desde el portapapeles')
                    }
                }
            }
        }

        window.addEventListener('paste', handlePaste)
        return () => window.removeEventListener('paste', handlePaste)
    }, [])

    const onDrop = (acceptedFiles: File[]) => {
        setImages(prev => [...prev, ...acceptedFiles])
    }

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: { 'image/*': [] }
    })

    const handleSolve = async () => {
        if ((images.length === 0 && !context) || !currentSpace) return
        setLoading(true)
        setResults([])

        try {
            const apiKey = localStorage.getItem("gemini_api_key")
            if (!apiKey) throw new Error("Configura tu API Key en ajustes (esquina superior derecha).")

            // Get Session Token
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error("Sesión expirada. Por favor recarga la página.")

            // Convert images to Base64 for Gemini
            const processedImages = await Promise.all(images.map(async (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => {
                        const base64 = (reader.result as string).split(',')[1]
                        resolve({
                            inlineData: {
                                data: base64,
                                mimeType: file.type
                            }
                        })
                    }
                    reader.onerror = reject
                    reader.readAsDataURL(file)
                })
            }))

            const response = await fetch('/api/quiz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    prompt: context || "Genera preguntas de quiz relevantes sobre este material.",
                    spaceId: currentSpace.id,
                    apiKey,
                    images: processedImages
                })
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "Error en el servidor")

            setResults(data.results)

            // Save to Supabase for Analytics/History
            if (session.user) {
                await supabase.from('quizzes').insert({
                    user_id: session.user.id,
                    title: context ? `Quiz: ${context.substring(0, 30)}...` : `Quiz Generado - ${new Date().toLocaleDateString()}`,
                    questions: data.results,
                    results: { space_id: currentSpace.id } // Storing space_id for analytics filtering
                })
            }

        } catch (error: any) {
            console.error(error)
            setResults([{ q: "Error", a: error.message || "No se pudo generar el quiz." }])
        } finally {
            setLoading(false)
        }
    }

    if (!currentSpace) return <div className="p-8 text-center text-muted-foreground">Selecciona un espacio de estudio primero.</div>

    return (
        <div className="space-y-4 h-full flex flex-col">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Zona Quiz IA</h2>
            <p className="text-xs text-muted-foreground">Analizando contenido de: <span className="font-semibold text-primary">{currentSpace.name}</span></p>

            <div className="grid md:grid-cols-2 gap-4 flex-1 md:overflow-hidden">
                {/* Inputs Info */}
                <div className="flex flex-col gap-4 md:overflow-y-auto pb-4 scrollbar-hide">
                    <Card className="p-4 space-y-4 bg-card/60 backdrop-blur-sm border-border/50">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Contexto / Pregunta Escrita</label>
                            <textarea
                                className="w-full min-h-[100px] p-3 rounded-lg border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm resize-none"
                                placeholder="Escribe aquí las preguntas directamente o añade contexto para la IA..."
                                value={context}
                                onChange={e => setContext(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Imágenes / Capturas de Test</label>
                            <div
                                {...getRootProps()}
                                className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-accent/20"
                            >
                                <input {...getInputProps()} />
                                <div className="p-3 bg-background rounded-full mb-2 shadow-sm">
                                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-xs text-muted-foreground text-center">Arrastra imágenes, click para subir</p>
                                <p className="text-[10px] text-muted-foreground/60 text-center mt-1">o presiona Ctrl+V para pegar</p>
                            </div>

                            {/* Image Preview List */}
                            {images.length > 0 && (
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                    {images.map((img, i) => (
                                        <div
                                            key={i}
                                            className="relative aspect-square rounded-lg overflow-hidden border border-border group cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                            onClick={() => setSelectedImageIndex(i)}
                                        >
                                            <img src={URL.createObjectURL(img)} alt="preview" className="object-cover w-full h-full" />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setImages(images.filter((_, idx) => idx !== i)) }}
                                                className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Eliminar imagen"
                                            >
                                                <Trash className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={handleSolve}
                            disabled={loading || (images.length === 0 && !context)}
                            className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
                        >
                            {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                            {loading ? "Analizando..." : "Resolver Quiz con IA"}
                        </Button>
                    </Card>
                </div>

                {/* Outputs */}
                <div className="flex flex-col gap-4 md:overflow-y-auto pb-20 scrollbar-hide">
                    {results.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/50 rounded-xl bg-card/20 p-8 text-center min-h-[300px]">
                            <Brain className="h-12 w-12 mb-4 opacity-20" />
                            <p className="text-sm font-medium">Esperando datos...</p>
                            <p className="text-xs text-muted-foreground mt-2 max-w-[200px]">Sube tus preguntas y la IA analizará tu biblioteca para responder basándose EXCLUSIVAMENTE en tus archivos.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {results.map((res, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <Card className="p-4 border-l-4 border-l-primary bg-card/80 backdrop-blur-sm">
                                        <div className="flex items-start gap-3">
                                            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                                                {i + 1}
                                            </span>
                                            <div className="space-y-2 w-full">
                                                <p className="text-sm font-semibold">{res.q}</p>
                                                <div className="bg-secondary/10 p-3 rounded-lg border border-secondary/20">
                                                    <p className="text-sm text-foreground/90 leading-relaxed">{res.a}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            ))}
                            <Button
                                variant="outline"
                                className="w-full border-dashed"
                                onClick={() => {
                                    setResults([])
                                    setImages([])
                                    setContext("")
                                }}
                            >
                                Limpiar Todo
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Full-Size Image Modal */}
            {selectedImageIndex !== null && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setSelectedImageIndex(null)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                        onClick={() => setSelectedImageIndex(null)}
                    >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <div className="max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center">
                        <img
                            src={URL.createObjectURL(images[selectedImageIndex])}
                            alt="Vista completa"
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
