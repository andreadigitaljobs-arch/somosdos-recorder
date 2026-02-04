"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { FileText, List, Bookmark, Tag, AlertTriangle, Lightbulb, GraduationCap, X, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// Types matching our DB schema
type FileAnalysis = {
    summary_structural: string
    segments: Array<{ start: number; end: number; title: string }>
    bookmarks: Array<{ start: number; label: string; type: 'definition' | 'warning' | 'key_idea' | 'example' | 'evaluable' }>
}

type SmartViewerProps = {
    isOpen: boolean
    onClose: () => void
    fileId: string
    fileName: string
}

export function SmartFileViewer({ isOpen, onClose, fileId, fileName }: SmartViewerProps) {
    const [activeTab, setActiveTab] = useState("transcript")
    const [transcript, setTranscript] = useState<string>("")
    const [analysis, setAnalysis] = useState<FileAnalysis | null>(null)
    const [tags, setTags] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        if (!isOpen || !fileId) return

        const fetchData = async () => {
            setLoading(true)
            try {
                // 1. Fetch Transcript Content
                const { data: fileData, error: fileError } = await supabase
                    .storage
                    .from('library_files')
                    .download(`${await getStoragePath(fileId)}`) // Need storage path logic

                if (fileData) {
                    setTranscript(await fileData.text())
                }

                // 2. Fetch AI Analysis
                const { data: analysisData } = await supabase
                    .from('file_analysis')
                    .select('*')
                    .eq('file_id', fileId)
                    .single()

                if (analysisData) setAnalysis(analysisData)

                // 3. Fetch Tags
                const { data: tagData } = await supabase
                    .from('file_tags')
                    .select('tags(name)')
                    .eq('file_id', fileId)

                if (tagData) {
                    setTags(tagData.map((t: any) => t.tags.name))
                }

            } catch (error) {
                console.error("Error fetching file data:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [isOpen, fileId, supabase])

    // Helper to get path (since we passed ID, we might need to fetch file meta first or pass item)
    // Ideally we pass 'item' object directly to props to avoid this roundtrip.
    const getStoragePath = async (id: string) => {
        const { data } = await supabase.from('files').select('storage_path').eq('id', id).single()
        return data?.storage_path
    }

    // Bookmark Icon Mapper
    const getBookmarkIcon = (type: string) => {
        switch (type) {
            case 'warning': return <AlertTriangle className="h-4 w-4 text-orange-500" />
            case 'definition': return <List className="h-4 w-4 text-blue-500" /> // Using List as placeholder or Book
            case 'key_idea': return <Lightbulb className="h-4 w-4 text-yellow-500" />
            case 'evaluable': return <GraduationCap className="h-4 w-4 text-purple-500" />
            default: return <Bookmark className="h-4 w-4 text-gray-500" />
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 bg-background/95 backdrop-blur-md">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b shrink-0">
                    <div className="flex flex-col gap-1">
                        <DialogTitle>{fileName}</DialogTitle>
                        <div className="flex gap-2">
                            {tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs px-2 py-0 h-5">
                                    <Tag className="h-3 w-3 mr-1 opacity-50" /> {tag}
                                </Badge>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* We could add generic actions here */}
                    </div>
                </div>

                {/* Body */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 border-b shrink-0 bg-muted/20">
                        <TabsList className="bg-transparent h-10 p-0 justify-start gap-4">
                            <TabsTrigger value="transcript" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2">
                                <FileText className="h-4 w-4 mr-2" /> Transcripción
                            </TabsTrigger>
                            <TabsTrigger value="structure" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2">
                                <List className="h-4 w-4 mr-2" /> Estructura & Resumen
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Content: Transcript */}
                    <TabsContent value="transcript" className="flex-1 min-h-0 m-0 relative">
                        <div className="absolute inset-0 flex">
                            {/* Main Text */}
                            <ScrollArea className="flex-1 p-6 h-full">
                                <div className="prose dark:prose-invert max-w-none text-sm font-mono whitespace-pre-wrap leading-7">
                                    {/* TODO: Intelligent Rendering with Segment Markers */}
                                    {transcript}
                                </div>
                            </ScrollArea>

                            {/* Right Sidebar: Bookmarks */}
                            {analysis?.bookmarks && (
                                <div className="w-80 border-l bg-muted/10 shrink-0 flex flex-col">
                                    <div className="p-3 border-b font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                                        Marcadores Automáticos
                                    </div>
                                    <ScrollArea className="flex-1">
                                        <div className="p-3 space-y-3">
                                            {analysis.bookmarks.map((bm, i) => (
                                                <div key={i} className="p-3 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors group">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
                                                            {getBookmarkIcon(bm.type)}
                                                            <span className="uppercase">{bm.type}</span>
                                                        </div>
                                                        <span className="text-[10px] bg-muted px-1.5 rounded text-muted-foreground font-mono">
                                                            {new Date(bm.start * 1000).toISOString().substr(14, 5)}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-sm leading-snug">{bm.label}</p>
                                                </div>
                                            ))}
                                            {analysis.bookmarks.length === 0 && (
                                                <div className="text-center py-10 text-muted-foreground text-sm">
                                                    Sin marcadores detectados.
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* Content: Structure */}
                    <TabsContent value="structure" className="flex-1 min-h-0 m-0 p-6 overflow-hidden">
                        <div className="h-full flex gap-8">
                            {/* Structural Summary */}
                            <div className="flex-1 flex flex-col max-w-2xl">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <BrainIcon /> Resumen Estructural
                                </h3>
                                <div className="p-6 rounded-xl border bg-card/50 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
                                    {analysis?.summary_structural || "Analizando estructura..."}
                                </div>
                            </div>

                            {/* Timeline segments */}
                            <div className="w-96 shrink-0 flex flex-col">
                                <h3 className="text-lg font-semibold mb-4">Segmentación Temática</h3>
                                <ScrollArea className="flex-1 pr-4">
                                    <div className="space-y-4 relative pl-4 border-l-2 border-muted">
                                        {analysis?.segments?.map((seg, i) => (
                                            <div key={i} className="relative pl-6 pb-6">
                                                <div className="absolute -left-[25px] top-0 h-4 w-4 rounded-full border-2 border-background bg-primary" />
                                                <div className="text-xs font-mono text-muted-foreground mb-1">
                                                    {new Date(seg.start * 1000).toISOString().substr(14, 5)} - {new Date(seg.end * 1000).toISOString().substr(14, 5)}
                                                </div>
                                                <h4 className="font-semibold text-sm">{seg.title}</h4>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </TabsContent>

                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

function BrainIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-purple-600"
        >
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
            <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
            <path d="M6 18a4 4 0 0 1-1.937-5.895" />
            <path d="M18 18a4 4 0 0 0 1.937-5.895" />
        </svg>
    )
}
