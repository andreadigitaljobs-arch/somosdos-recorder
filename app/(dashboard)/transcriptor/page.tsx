"use client"

import { useState, useEffect, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AlertCircle, CheckCircle, Clock, Copy, Eye, Loader2, Play, Save, Upload, X, Folder, FolderPlus, Search, Pencil, Download, Mic, Circle } from 'lucide-react'
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useSpace } from "@/components/providers/space-provider"
import { useTranscription, QueueItem } from "@/components/providers/transcription-provider"
import { LiveRecorder } from "@/components/transcription/live-recorder"

// Types
type FolderItem = {
    id: string
    name: string
    parent_id: string | null
}

export default function TranscriptorPage() {
    // --- Global State ---
    const { queue, isProcessing, setIsProcessing, addToQueue, removeItem, updateItemStatus, saveToLibrary } = useTranscription()
    const { currentSpace } = useSpace()
    const supabase = createClient()
    const router = useRouter()

    // --- Local UI State ---
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
    const [itemToSave, setItemToSave] = useState<QueueItem | null>(null)
    const [saveFileName, setSaveFileName] = useState("")
    const [folders, setFolders] = useState<FolderItem[]>([])
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
    const [showToast, setShowToast] = useState(false)
    const [toastStatus, setToastStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [toastMessage, setToastMessage] = useState("")
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
    const [loadingFolders, setLoadingFolders] = useState(false)
    
    // --- History State ---
    const [recentHistory, setRecentHistory] = useState<any[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    // --- Folder Creation/Search ---
    const [isCreatingFolder, setIsCreatingFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState("")
    const [folderSearchQuery, setFolderSearchQuery] = useState("")

    // --- Preview/Edit State ---
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
    const [previewItem, setPreviewItem] = useState<QueueItem | null>(null)
    const [previewText, setPreviewText] = useState("")

    // --- History Logic ---
    const fetchRecentHistory = useCallback(async () => {
        if (!currentSpace) return
        setLoadingHistory(true)
        try {
            const { data } = await supabase
                .from('transcriptions')
                .select('id, created_at, metadata')
                .eq('metadata->>space_id', currentSpace.id)
                .order('created_at', { ascending: false })
                .limit(3)
            setRecentHistory(data || [])
        } catch (e) {
            console.error("Error history:", e)
        } finally {
            setLoadingHistory(false)
        }
    }, [currentSpace, supabase])

    useEffect(() => {
        fetchRecentHistory()
    }, [fetchRecentHistory])

    // --- Folder Logic ---
    const fetchFolders = useCallback(async (silent = false) => {
        if (!currentSpace) return
        if (!silent) setLoadingFolders(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data, error } = await supabase
                .from('files')
                .select('id, name, parent_id')
                .eq('user_id', user.id)
                .eq('space_id', currentSpace.id)
                .eq('type', 'folder')
                .order('name', { ascending: true })
            if (error) throw error
            setFolders(data || [])
            setLastRefreshed(new Date())
        } catch (e) {
            console.error(e)
        } finally {
            if (!silent) setLoadingFolders(false)
        }
    }, [currentSpace, supabase])

    useEffect(() => {
        fetchFolders(true)
    }, [fetchFolders])

    // --- File Handling ---
    const onDrop = (acceptedFiles: File[]) => {
        addToQueue(acceptedFiles)
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'audio/*': [],
            'video/*': [],
            'audio/mpeg': ['.mp3', '.m4a'],
            'audio/mp4': ['.m4a', '.mp4'],
            'audio/x-m4a': ['.m4a'],
            'audio/aac': ['.aac'],
            'audio/ogg': ['.ogg', '.oga'],
            'audio/wav': ['.wav'],
            'audio/webm': ['.weba']
        },
        maxFiles: 10
    })

    // --- Toast Logic ---
    useEffect(() => {
        if (showToast && toastStatus !== 'loading') {
            const timer = setTimeout(() => setShowToast(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [showToast, toastStatus])

    // --- Modal Logic ---
    const openSaveModal = (item: QueueItem) => {
        if (!currentSpace) return
        setItemToSave(item)
        const name = item.file.name.split('.')[0] || item.file.name
        setSaveFileName(name)
        setIsSaveModalOpen(true)
        fetchFolders()
    }

    const confirmSave = async () => {
        if (!itemToSave) return
        setIsSaveModalOpen(false)
        setToastStatus('loading')
        setToastMessage("Guardando...")
        setShowToast(true)
        try {
            await saveToLibrary(itemToSave, selectedFolderId, saveFileName)
            setToastStatus('success')
            setToastMessage("¡Guardado!")
            fetchRecentHistory()
        } catch (e) {
            setToastStatus('error')
            setToastMessage("Error al guardar")
        }
    }

    const openPreview = (item: QueueItem) => {
        setPreviewItem(item)
        setPreviewText(item.transcript || "")
        setIsPreviewModalOpen(true)
    }

    const savePreviewEdits = () => {
        if (previewItem) {
            updateItemStatus(previewItem.id, 'completed', 100, previewText)
        }
        setIsPreviewModalOpen(false)
    }

    const handleCreateFolder = async () => {
        if (!newFolderName || !currentSpace) return
        setLoadingFolders(true)
        try {
            const { data: user } = await supabase.auth.getUser()
            const { data, error } = await supabase.from('files').insert({
                user_id: user.data.user?.id,
                space_id: currentSpace.id,
                name: newFolderName,
                type: 'folder'
            }).select().single()
            if (error) throw error
            await fetchFolders()
            if (data) setSelectedFolderId(data.id)
            setNewFolderName("")
            setIsCreatingFolder(false)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingFolders(false)
        }
    }

    return (
        <div className="space-y-8 pb-32 max-w-5xl mx-auto px-4 md:px-0">
            {/* Welcoming Header */}
            <header className="flex flex-col gap-1 px-2">
                <h2 className="text-2xl font-bold tracking-tight text-foreground/90 font-sans">
                    Bienvenido a <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">SomosDos Grabadora</span>
                </h2>
                <p className="text-muted-foreground text-xs font-medium">Captura, recupera y transcribe sin límites.</p>
            </header>

            <div className="space-y-8">
                {/* Live Recorder Component */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-widest text-primary/70">
                        <Circle className="h-3 w-3 fill-primary animate-pulse" />
                        Grabación en Directo
                    </div>
                    <LiveRecorder />
                </div>

                {/* Recent History Quick Access */}
                <div className="space-y-4 px-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <span>Últimas 3 Grabaciones</span>
                        <button onClick={() => router.push('/library')} className="text-primary hover:underline transition-colors lowercase font-bold">Ver Todo</button>
                    </div>
                    
                    {loadingHistory ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />)}
                        </div>
                    ) : recentHistory.length === 0 ? (
                        <div className="p-8 text-center rounded-2xl border border-dashed border-border/20 text-xs text-muted-foreground">
                            No hay grabaciones recientes en este espacio.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {recentHistory.map((item) => (
                                <div 
                                    key={item.id} 
                                    onClick={() => router.push(`/library?id=${item.id}`)}
                                    className="p-4 rounded-2xl border border-border/20 bg-[#0c122e]/40 backdrop-blur-md hover:bg-accent/10 transition-all cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                            <Mic className="h-3 w-3" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-bold truncate group-hover:text-primary">
                                                {(item.metadata as any)?.filename || 'Audio'}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Upload Zone & Queue */}
                <div className="space-y-4 px-2">
                    <div 
                        {...getRootProps()} 
                        className={`w-full py-8 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer ${isDragActive ? 'border-primary bg-primary/10' : 'border-border/20 bg-card/10 hover:bg-card/20'}`}
                    >
                        <input {...getInputProps()} />
                        <div className="p-3 rounded-full bg-primary/10 mb-2">
                            <Upload className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-sm font-medium">O sube archivos de audio/video</p>
                    </div>

                    {/* Pending Queue */}
                    {queue.length > 0 && (
                        <Card className="bg-card/30 border-border/50 overflow-hidden divide-y divide-border/20">
                            <div className="p-4 bg-muted/20 flex justify-between items-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                <span>Cola de Transcripción ({queue.length})</span>
                                {!isProcessing && queue.some(i => i.status === 'pending') && (
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-primary" onClick={() => setIsProcessing(true)}>
                                        Iniciar Procesado
                                    </Button>
                                )}
                            </div>
                            <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
                                <AnimatePresence>
                                    {queue.map(item => (
                                        <motion.div 
                                            key={item.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="flex items-center justify-between p-3 rounded-xl border border-border/10 bg-card/60"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                {item.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                                                {item.status === 'processing' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                                                {item.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                                {item.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-semibold truncate">{item.file.name}</span>
                                                    {item.status === 'processing' && (
                                                        <span className="text-[10px] text-primary animate-pulse">{Math.round(item.progress)}% - {item.statusMessage}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {item.status === 'completed' && (
                                                    <>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-400" onClick={() => openPreview(item)}><Eye className="h-3.5 w-3.5" /></Button>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => openSaveModal(item)}><Save className="h-3.5 w-3.5" /></Button>
                                                    </>
                                                )}
                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.id)}><X className="h-3.5 w-3.5" /></Button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            {/* Save Modal */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md p-6 space-y-4">
                        <h3 className="text-lg font-bold">Guardar Transcripción</h3>
                        <Input value={saveFileName} onChange={(e) => setSaveFileName(e.target.value)} placeholder="Nombre del archivo" />
                        <div className="max-h-60 overflow-y-auto border border-border/20 rounded-xl p-2 space-y-1">
                            {folders.map(f => (
                                <button key={f.id} onClick={() => setSelectedFolderId(f.id)} className={`w-full text-left p-2 rounded-lg text-sm ${selectedFolderId === f.id ? 'bg-primary/20 text-primary' : 'hover:bg-accent'}`}>
                                    <Folder className="h-4 w-4 inline mr-2" /> {f.name}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2 justify-end pt-4">
                            <Button variant="outline" onClick={() => setIsSaveModalOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmSave}>Confirmar Guardado</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Preview Modal */}
            {isPreviewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                    <Card className="w-full max-w-3xl h-[80vh] flex flex-col p-0">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold">Revisar Transcripción</h3>
                            <Button variant="ghost" size="icon" onClick={() => setIsPreviewModalOpen(false)}><X className="h-4 w-4" /></Button>
                        </div>
                        <textarea className="flex-1 p-6 bg-transparent resize-none outline-none font-mono text-sm leading-relaxed" value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
                        <div className="p-4 border-t flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)}>Cancelar</Button>
                            <Button onClick={savePreviewEdits}>Guardar Cambios</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Toast Notifications */}
            {showToast && (
                <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-right-10">
                    <Card className={`p-4 shadow-2xl border-none ${toastStatus === 'success' ? 'bg-green-500 text-white' : toastStatus === 'error' ? 'bg-red-500 text-white' : 'bg-[#0c122e] text-primary'}`}>
                        <div className="flex items-center gap-3">
                            {toastStatus === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                            {toastStatus === 'success' && <CheckCircle className="h-4 w-4" />}
                            {toastStatus === 'error' && <AlertCircle className="h-4 w-4" />}
                            <span className="text-sm font-bold">{toastMessage}</span>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
