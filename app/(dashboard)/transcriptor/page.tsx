"use client"

import { useState } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Upload, Play, Save, Copy, FolderPlus, Folder, X, CheckCircle, Clock, Loader2, AlertCircle, Eye, Pencil } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useSpace } from "@/components/providers/space-provider"
import { useTranscription, QueueItem } from "@/components/providers/transcription-provider"

// Types
type FolderItem = {
    id: string
    name: string
    parent_id: string | null
}

export default function TranscriptorPage() {
    // --- Global State ---
    const { queue, isProcessing, setIsProcessing, addToQueue, removeItem, updateItemStatus } = useTranscription()

    // --- Local UI State ---
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
    const [itemToSave, setItemToSave] = useState<QueueItem | null>(null)
    const [saveFileName, setSaveFileName] = useState("")
    const [folders, setFolders] = useState<FolderItem[]>([])
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
    const [isCreatingFolder, setIsCreatingFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState("")

    // Preview/Edit State
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
    const [previewItem, setPreviewItem] = useState<QueueItem | null>(null)
    const [previewText, setPreviewText] = useState("")

    const { currentSpace } = useSpace()
    const supabase = createClient()

    // --- File Handling ---
    const onDrop = (acceptedFiles: File[]) => {
        addToQueue(acceptedFiles)
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'audio/*': [], 'video/*': [] },
        maxFiles: 10
    })

    // --- Save Modal Logic ---
    const openSaveModal = (item: QueueItem) => {
        if (!currentSpace) {
            alert("Selecciona un espacio primero")
            return
        }
        setItemToSave(item)
        // FIX: Use original filename without extension as default
        const originalName = item.file.name.substring(0, item.file.name.lastIndexOf('.')) || item.file.name
        setSaveFileName(originalName)

        setIsSaveModalOpen(true)
        fetchFolders()
    }

    const fetchFolders = async () => {
        if (!currentSpace) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
            .from('files')
            .select('id, name, parent_id')
            .eq('user_id', user.id)
            .eq('space_id', currentSpace.id)
            .eq('type', 'folder')
            .order('name', { ascending: true })
        if (data) setFolders(data)
    }

    const handleCreateFolder = async () => {
        if (!newFolderName || !currentSpace) return
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data, error } = await supabase
                .from('files')
                .insert({
                    user_id: user.id,
                    space_id: currentSpace.id,
                    parent_id: selectedFolderId,
                    name: newFolderName,
                    type: 'folder'
                })
                .select().single()

            if (error) throw error
            await fetchFolders()
            if (data) setSelectedFolderId(data.id)
            setNewFolderName("")
            setIsCreatingFolder(false)
        } catch (e) {
            console.error(e)
            alert("Error creando carpeta")
        }
    }

    const confirmSave = async () => {
        if (!itemToSave || !itemToSave.transcript || !currentSpace) return

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("No usuario autenticado")

            // Ensure .txt extension
            const fullFileName = saveFileName.trim() || itemToSave.file.name
            const finalName = fullFileName.endsWith('.txt') ? fullFileName : `${fullFileName}.txt`

            // SANITIZATION FIX:
            // Storage paths should be URL safe. We replace spaces and non-alphanumerics with _.
            // We KEEP the finalName for the database display name, but use sanitized for storage.
            const sanitizedName = finalName.replace(/[^a-zA-Z0-9.-]/g, '_')
            const filePath = `${user.id}/${Date.now()}_${sanitizedName}`

            const blob = new Blob([itemToSave.transcript], { type: 'text/plain' })
            const fileObj = new File([blob], finalName, { type: 'text/plain' }) // File object keep display name

            const { error: uploadError } = await supabase.storage.from('library_files').upload(filePath, fileObj)
            if (uploadError) throw uploadError

            const { error: dbError } = await supabase.from('files').insert({
                user_id: user.id,
                space_id: currentSpace.id,
                parent_id: selectedFolderId,
                name: finalName, // Display name (can have spaces)
                type: 'file',
                size_bytes: blob.size,
                storage_path: filePath // Sanitized path
            })
            if (dbError) throw dbError

            // Also save to Transcriptions table? Ideally yes, but users want the file generally.
            // For now, saving as file is what was requested.

            alert("Guardado con éxito!")
            setIsSaveModalOpen(false)
        } catch (error: any) {
            console.error("Error guardando:", error)
            alert(`Error al guardar: ${error.message}`)
        }
    }

    // --- Preview Logic ---
    const openPreview = (item: QueueItem) => {
        setPreviewItem(item)
        setPreviewText(item.transcript || "")
        setIsPreviewModalOpen(true)
    }

    const savePreviewEdits = () => {
        if (!previewItem) return
        // Update the global state with the new transcript
        updateItemStatus(previewItem.id, 'completed', 100, previewText)
        setIsPreviewModalOpen(false)
    }


    return (
        <div className="space-y-4 h-full flex flex-col relative">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Transcriptor IA</h2>
            </div>

            {/* Main Area: Split into Upload / Queue */}
            <div className="flex-1 overflow-hidden flex flex-col gap-6">

                {/* Upload Area (Always visible but shrinks if queue exists) */}
                <div
                    {...getRootProps()}
                    className={`w-full ${queue.length > 0 ? 'h-32' : 'flex-1'} min-h-[150px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer ${isDragActive ? 'border-primary bg-primary/10' : 'border-border bg-card/50 hover:bg-card/80'}`}
                >
                    <input {...getInputProps()} />
                    <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 mb-2 shadow-inner">
                        <Upload className={`${queue.length > 0 ? 'h-6 w-6' : 'h-10 w-10'} text-primary`} />
                    </div>
                    <p className="text-sm font-medium text-center">
                        {isDragActive ? "Suelta los archivos aquí" : "Arrastra tus archivos de audio/video"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Soporta múltiples archivos</p>
                </div>

                {/* Queue List */}
                {queue.length > 0 && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-card/30 rounded-2xl border border-border/50">
                        <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card/50">
                            <h3 className="font-semibold text-sm">Cola de Transcripción ({queue.length})</h3>
                            {!isProcessing && queue.find(i => i.status === 'pending') && (
                                <Button size="sm" onClick={() => setIsProcessing(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                    <Play className="h-3 w-3 mr-2" /> Iniciar Todo
                                </Button>
                            )}
                            {isProcessing && (
                                <p className="text-xs text-primary animate-pulse font-medium">Procesando cola...</p>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            <AnimatePresence>
                                {queue.map(item => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className={`relative flex items-center gap-3 p-3 rounded-xl border ${item.status === 'processing' ? 'border-primary/50 bg-primary/5' : 'border-border/30 bg-card/60'}`}
                                    >
                                        {/* Status Icon */}
                                        <div className="flex-shrink-0">
                                            {item.status === 'pending' && <Clock className="h-5 w-5 text-muted-foreground" />}
                                            {item.status === 'processing' && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                                            {item.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-500" />}
                                            {item.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                                        </div>

                                        {/* File Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{item.file.name}</p>
                                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                <span>{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                {item.status === 'processing' && (
                                                    <span className="flex items-center gap-2">
                                                        <span>{Math.round(item.progress)}%</span>
                                                        {item.statusMessage && (
                                                            <span className="hidden sm:inline-block text-primary/80 animate-pulse truncate max-w-[300px] md:max-w-[400px]">
                                                                {item.statusMessage}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                                {item.status === 'error' && <span className="text-red-400 truncate max-w-[150px]">{item.error}</span>}
                                            </div>
                                            {/* Progress Bar */}
                                            {item.status === 'processing' && (
                                                <div className="h-1 w-full bg-accent rounded-full mt-2 overflow-hidden">
                                                    <motion.div
                                                        className="h-full bg-primary"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${item.progress}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            {item.status === 'completed' && (
                                                <>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-500 hover:bg-blue-50" onClick={() => openPreview(item)} title="Ver/Editar">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openSaveModal(item)} title="Guardar">
                                                        <Save className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(item.transcript || ""); alert("Copiado!") }}>
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {queue.length === 0 && (
                                <p className="text-center text-muted-foreground text-sm py-8">La cola está vacía</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Save Modal */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <Card className="w-full max-w-md p-6 space-y-4 bg-background border-border shadow-2xl relative">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => setIsSaveModalOpen(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                        <h3 className="text-lg font-semibold">Guardar Transcripción</h3>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Nombre del archivo</label>
                                <Input value={saveFileName} onChange={(e) => setSaveFileName(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium">Carpeta</label>
                                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-1">
                                    <button onClick={() => setSelectedFolderId(null)} className={`flex items-center gap-2 p-2 w-full text-sm hover:bg-accent rounded-sm ${selectedFolderId === null ? 'bg-accent/50 text-primary' : ''}`}>
                                        <Folder className="h-4 w-4 opacity-50" /> Biblioteca (Raíz)
                                    </button>
                                    {folders.map(f => (
                                        <button key={f.id} onClick={() => setSelectedFolderId(f.id)} className={`flex items-center gap-2 p-2 w-full text-sm hover:bg-accent rounded-sm ${selectedFolderId === f.id ? 'bg-accent/50 text-primary' : ''}`}>
                                            <Folder className="h-4 w-4 text-yellow-500" /> {f.name}
                                        </button>
                                    ))}
                                </div>
                                {!isCreatingFolder ? (
                                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setIsCreatingFolder(true)}>
                                        <FolderPlus className="h-4 w-4 mr-2" /> Nueva Carpeta
                                    </Button>
                                ) : (
                                    <div className="flex gap-2 mt-2">
                                        <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Nombre carpeta" className="h-8" />
                                        <Button size="sm" onClick={handleCreateFolder}>Crear</Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsCreatingFolder(false)}><X className="h-4 w-4" /></Button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setIsSaveModalOpen(false)}>Cancelar</Button>
                            <Button onClick={confirmSave}>Guardar</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Preview/Edit Modal */}
            {isPreviewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-3xl h-[80vh] flex flex-col bg-background border-border shadow-2xl relative animate-in slide-in-from-bottom-10 duration-500">
                        <div className="flex items-center justify-between p-4 border-b">
                            <div className="flex items-center gap-2">
                                <Pencil className="h-4 w-4 text-primary" />
                                <h3 className="text-lg font-semibold">Revisar Transcripción</h3>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsPreviewModalOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="flex-1 p-0 overflow-hidden relative">
                            <textarea
                                className="w-full h-full p-6 resize-none focus:outline-none bg-transparent font-mono text-sm leading-relaxed"
                                value={previewText}
                                onChange={(e) => setPreviewText(e.target.value)}
                            />
                        </div>

                        <div className="p-4 border-t flex justify-between items-center bg-muted/20">
                            <span className="text-xs text-muted-foreground">{previewText.length} caracteres</span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)}>Cancelar</Button>
                                <Button onClick={savePreviewEdits}>Confirmar Cambios</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}
