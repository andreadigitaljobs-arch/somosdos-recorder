"use client"

import { useState, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Image as ImageIcon, Sparkles, RefreshCw, Trash, Brain, Pencil, Check, X, FileText } from "lucide-react"
import { motion } from "framer-motion"
import { useSpace } from "@/components/providers/space-provider"
import { createBrowserClient } from "@supabase/ssr"
import { FormattedText } from "@/components/formatted-text"
import { useAudioFeedback } from "@/hooks/use-audio-feedback"

// UI Types
type QuestionResult = {
    q: string;
    a: string;
    shortAnswer?: string;
    source?: string;
}

export default function QuizPage() {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const [images, setImages] = useState<File[]>([])
    const [context, setContext] = useState("")
    const [results, setResults] = useState<QuestionResult[]>([])
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [loadingMessage, setLoadingMessage] = useState("Iniciando...")
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
    const [currentQuizId, setCurrentQuizId] = useState<string | null>(null)
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [editValue, setEditValue] = useState("")
    const { currentSpace } = useSpace()
    const { playSound } = useAudioFeedback()

    // Reset state when space changes
    useEffect(() => {
        setImages([])
        setContext("")
        setResults([])
        setProgress(0)
    }, [currentSpace])

    // Progress Simulation
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (loading) {
            setProgress(0)
            setLoadingMessage("Conectando con Deep Search...")

            let p = 0
            interval = setInterval(() => {
                p += Math.random() * 5 // Random increment
                if (p > 90) p = 90 // Cap at 90% until done

                setProgress(Math.floor(p))

                // Dynamic messages based on progress
                if (p < 30) setLoadingMessage("Buscando en tu biblioteca...")
                else if (p < 60) setLoadingMessage("Leyendo documentos relevantes...")
                else if (p < 80) setLoadingMessage("Analizando con IA...")
                else setLoadingMessage("Redactando preguntas...")

            }, 500) // Update every 500ms
        } else {
            setProgress(100)
            setTimeout(() => setProgress(0), 1000) // Hide after 1s
        }

        return () => clearInterval(interval)
    }, [loading])

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
        playSound('start')
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

            // Timeout Controller to prevent infinite loading (25s limit)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

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
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId);

            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "Error en el servidor")

            setResults(data.results)
            setLoading(false) // UNBLOCK UI IMMEDIATELY
            playSound('success')

            // Save to Supabase for Analytics/History (Non-blocking)
            if (session.user) {
                // Fire and forget (or handle silently)
                supabase.from('quizzes').insert({
                    user_id: session.user.id,
                    title: context ? `Quiz: ${context.substring(0, 30)}...` : `Quiz Generado - ${new Date().toLocaleDateString()}`,
                    questions: data.results,
                    results: { space_id: currentSpace.id }
                }).then(({ error }) => {
                    if (error) console.error("Error saving history:", error)
                })
            }

        } catch (error: any) {
            console.error(error)
            setResults([{ q: "Error", a: error.message || "No se pudo generar el quiz." }])
            setLoading(false)
            playSound('error')
        }
    }

    const handleSaveEdit = async (index: number) => {
        const newResults = [...results]
        newResults[index].a = editValue
        setResults(newResults)
        setEditingIndex(null)

        // Persist to DB if we have an ID
        if (currentQuizId) {
            const { error } = await supabase
                .from('quizzes')
                .update({ questions: newResults })
                .eq('id', currentQuizId)

            if (error) console.error("Error updating quiz:", error)
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


                        <div className="space-y-2">
                            {loading ? (
                                <div className="space-y-2">
                                    <div className="h-9 w-full bg-secondary/20 rounded-md overflow-hidden relative border border-secondary/10">
                                        <motion.div
                                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary/80 to-primary"
                                            initial={{ width: "0%" }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ ease: "linear" }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-foreground/80 z-10">
                                            {progress}% - {loadingMessage}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    onClick={handleSolve}
                                    disabled={loading || (images.length === 0 && !context)}
                                    className="w-full bg-gradient-to-r from-primary to-secondary text-white font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
                                >
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Resolver Quiz con IA
                                </Button>
                            )}
                        </div>
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
                                    <Card className="p-4 border-l-4 border-l-primary bg-card/80 backdrop-blur-sm group relative">
                                        <div className="flex items-start gap-3">
                                            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                                                {i + 1}
                                            </span>
                                            <div className="space-y-2 w-full pr-8">
                                                <p className="text-sm font-semibold">{res.q}</p>

                                                {editingIndex === i ? (
                                                    <div className="space-y-2">
                                                        <textarea
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            className="w-full min-h-[80px] p-2 rounded-md border border-primary/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                                            autoFocus
                                                        />
                                                        <div className="flex gap-2 justify-end">
                                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => setEditingIndex(null)}>
                                                                <X className="h-4 w-4 mr-1" /> Cancelar
                                                            </Button>
                                                            <Button size="sm" className="h-7 px-2" onClick={() => handleSaveEdit(i)}>
                                                                <Check className="h-4 w-4 mr-1" /> Guardar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-secondary/10 p-3 rounded-lg border border-secondary/20 relative group/answer">
                                                        {/* Short Answer Badge */}
                                                        {res.shortAnswer && (
                                                            <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-secondary/20 justify-between">
                                                                <div className="flex gap-2 flex-wrap">
                                                                    {res.shortAnswer.split(',').map((ans: string, idx: number) => (
                                                                        <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground shadow-sm">
                                                                            ✓ {ans.trim()}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                {/* Source Attribution */}
                                                                {res.source && (
                                                                    <span className="text-[10px] text-muted-foreground/80 flex items-center gap-1 bg-background/50 px-2 py-1 rounded-md border border-border/30">
                                                                        <FileText className="h-3 w-3" />
                                                                        Fuente: {res.source}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {/* Long Answer with FormattedText */}
                                                        <FormattedText text={res.a} />
                                                        <button
                                                            onClick={() => {
                                                                setEditingIndex(i)
                                                                setEditValue(res.a)
                                                            }}
                                                            className="absolute top-2 right-2 p-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 rounded transition-all opacity-0 group-hover/answer:opacity-100"
                                                            title="Editar respuesta"
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                )}
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
                                    setCurrentQuizId(null)
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
                        <X className="h-6 w-6" />
                    </button>
                    <div className="max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center">
                        <img
                            src={URL.createObjectURL(images[selectedImageIndex])}
                            alt="full size"
                            className="max-w-full max-h-full object-contain"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
