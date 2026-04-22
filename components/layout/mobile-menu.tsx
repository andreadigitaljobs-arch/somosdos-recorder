"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useSpace } from "@/components/providers/space-provider"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { LogOut, User, Layers, X, LayoutGrid, Settings, Key, Eye, EyeOff, Activity, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { listAvailableModels } from "@/app/actions/transcribe"

interface MobileMenuProps {
    isOpen: boolean
    onClose: () => void
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
    const { spaces, currentSpace, setCurrentSpace, handleUpdateSpace } = useSpace()
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const supabase = createClient()
    const router = useRouter()

    // Space Editing State
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState("")

    const handleSaveRename = async (id: string) => {
        if (!editText.trim()) return
        await handleUpdateSpace(id, editText.trim())
        setEditingId(null)
    }

    // Settings State
    const [showSettings, setShowSettings] = useState(false)
    const [apiKey, setApiKey] = useState("")
    const [showApiKey, setShowApiKey] = useState(false)
    const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [availableModels, setAvailableModels] = useState<any[]>([])

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) setUserEmail(user.email ?? null)
        }
        getUser()
        
        const storedKey = localStorage.getItem("gemini_api_key")
        if (storedKey) setApiKey(storedKey)
    }, [supabase, isOpen])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push("/login")
        onClose()
    }

    const handleSaveApiKey = () => {
        if (apiKey.trim()) {
            localStorage.setItem("gemini_api_key", apiKey.trim())
        } else {
            localStorage.removeItem("gemini_api_key")
        }
        setShowSettings(false)
    }

    const handleTestKey = async () => {
        if (!apiKey.trim()) return
        setTestStatus('loading')
        try {
            const result = await listAvailableModels(apiKey.trim())
            if (result.models) {
                setTestStatus('success')
                setAvailableModels(result.models)
            } else {
                setTestStatus('error')
            }
        } catch (e) {
            setTestStatus('error')
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                    />

                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 bg-[#0c122e] border-t border-primary/20 rounded-t-[32px] z-[70] p-6 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto"
                    >
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />

                        <div className="space-y-8">
                            {/* User Section */}
                            <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                        <User className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sesión Activa</span>
                                        <span className="text-sm font-semibold truncate max-w-[150px]">{userEmail || "Cargando..."}</span>
                                    </div>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Main Navigation Logic */}
                            {!showSettings ? (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {/* Spaces Section */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-1">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Mis Espacios</span>
                                            <Layers className="h-3 w-3 text-primary/50" />
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {spaces.map(space => (
                                                <div key={space.id} className="relative group">
                                                    {editingId === space.id ? (
                                                        <motion.div 
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            className="flex items-center gap-2 p-2 bg-primary/10 rounded-2xl border border-primary/30"
                                                        >
                                                            <Input 
                                                                autoFocus
                                                                value={editText}
                                                                onChange={(e) => setEditText(e.target.value)}
                                                                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(space.id)}
                                                                className="h-10 bg-transparent border-none text-sm placeholder:text-white/20 focus-visible:ring-0"
                                                            />
                                                            <div className="flex gap-1 pr-1">
                                                                <Button 
                                                                    size="icon" 
                                                                    className="h-8 w-8 rounded-lg bg-green-500 hover:bg-green-600"
                                                                    onClick={() => handleSaveRename(space.id)}
                                                                >
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                </Button>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost"
                                                                    className="h-8 w-8 rounded-lg text-white/50"
                                                                    onClick={() => setEditingId(null)}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </motion.div>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setCurrentSpace(space)
                                                                onClose()
                                                            }}
                                                            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                                                currentSpace?.id === space.id 
                                                                ? 'bg-primary/20 border-primary shadow-[0_0_20px_rgba(39,73,208,0.2)]' 
                                                                : 'bg-white/5 border-white/5'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <LayoutGrid className={`h-4 w-4 ${currentSpace?.id === space.id ? 'text-primary' : 'text-muted-foreground'}`} />
                                                                <span className={`text-sm font-semibold ${currentSpace?.id === space.id ? 'text-white' : 'text-muted-foreground'}`}>
                                                                    {space.name}
                                                                </span>
                                                            </div>
                                                            
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className={`h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${currentSpace?.id === space.id ? 'text-primary' : 'text-muted-foreground'}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingId(space.id);
                                                                    setEditText(space.name);
                                                                }}
                                                            >
                                                                <Settings className="h-3 w-3" />
                                                            </Button>
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="flex gap-3">
                                        <Button 
                                            variant="outline" 
                                            className="flex-1 h-12 rounded-2xl bg-white/5 border-white/5 gap-3"
                                            onClick={() => setShowSettings(true)}
                                        >
                                            <Settings className="h-4 w-4 text-primary" />
                                            <span className="text-xs">Ajustes IA</span>
                                        </Button>
                                        <Button variant="outline" className="h-12 w-12 rounded-2xl bg-white/5 border-white/5" onClick={onClose}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest mb-4">
                                        <Key className="h-4 w-4" />
                                        Configuración Gemini
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <Input
                                                type={showApiKey ? "text" : "password"}
                                                placeholder="Tu Gemini API Key..."
                                                value={apiKey}
                                                onChange={(e) => setApiKey(e.target.value)}
                                                className="bg-white/5 border-white/10 h-12 rounded-xl pr-12 text-sm"
                                            />
                                            <button 
                                                onClick={() => setShowApiKey(!showApiKey)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                                            >
                                                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>

                                        <Button 
                                            variant="outline" 
                                            className="w-full h-10 rounded-xl border-dashed border-primary/30 text-[10px] font-bold uppercase tracking-wider"
                                            onClick={handleTestKey}
                                            disabled={testStatus === 'loading' || !apiKey}
                                        >
                                            {testStatus === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : 
                                             testStatus === 'success' ? <CheckCircle2 className="h-3 w-3 text-green-500" /> :
                                             testStatus === 'error' ? <XCircle className="h-3 w-3 text-red-500" /> : <Activity className="h-3 w-3" />}
                                            {testStatus === 'loading' ? 'Probando...' : 'Probar Clave (Diagnóstico)'}
                                        </Button>

                                        {testStatus === 'success' && (
                                            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-[10px] text-green-400">
                                                ¡Clave Activa! {availableModels.length} modelos detectados.
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-3">
                                        <Button variant="ghost" className="flex-1 h-12 text-xs" onClick={() => setShowSettings(false)}>Volver</Button>
                                        <Button className="flex-1 h-12 rounded-2xl" onClick={handleSaveApiKey}>Guardar Cambios</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
