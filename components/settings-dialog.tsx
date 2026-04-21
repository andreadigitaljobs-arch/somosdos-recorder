import { useState, useEffect } from "react"
import { Settings, Key, Eye, EyeOff, Activity, CheckCircle2, XCircle, Loader2, Sparkles, Copy } from "lucide-react"
import { listAvailableModels } from "@/app/actions/transcribe"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SettingsDialog() {
    const [open, setOpen] = useState(false)
    const [apiKey, setApiKey] = useState("")
    const [showPassword, setShowPassword] = useState(false)

    useEffect(() => {
        if (open) {
            const storedKey = localStorage.getItem("gemini_api_key")
            if (storedKey) setApiKey(storedKey)
        }
    }, [open])

    const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle')
    const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [testError, setTestError] = useState("")
    const [availableModels, setAvailableModels] = useState<any[]>([])

    const handleTest = async () => {
        if (!apiKey.trim()) return
        setTestStatus('loading')
        setTestError("")
        setAvailableModels([])
        
        try {
            const result = await listAvailableModels(apiKey.trim())
            if (result.models) {
                setTestStatus('success')
                setAvailableModels(result.models)
            } else {
                setTestStatus('error')
                setTestError(result.error || "No se encontraron modelos activos para esta clave.")
            }
        } catch (e) {
            setTestStatus('error')
            setTestError("No se pudo conectar con el servidor.")
        }
    }

    const handleSave = () => {
        if (apiKey.trim()) {
            localStorage.setItem("gemini_api_key", apiKey.trim())
            setSaveStatus('success')
            setTimeout(() => {
                setSaveStatus('idle')
                setOpen(false)
            }, 800)
        } else {
            localStorage.removeItem("gemini_api_key")
            setOpen(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <Settings className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Configuración</DialogTitle>
                    <DialogDescription>
                        Ajusta tus preferencias y claves de API.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="apiKey" className="flex items-center gap-2">
                            <Key className="h-4 w-4" />
                            Gemini API Key
                        </Label>
                        <div className="relative">
                            <Input
                                id="apiKey"
                                type={showPassword ? "text" : "password"}
                                placeholder="Pegar tu API Key aquí..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                                aria-label={showPassword ? "Ocultar API Key" : "Mostrar API Key"}
                            >
                                {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Se guardará localmente en tu navegador. Necesaria para Quiz y Transcriptor.
                        </p>

                        <div className="pt-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full gap-2 text-xs h-9 border-dashed border-primary/30 hover:border-primary"
                                onClick={handleTest}
                                disabled={testStatus === 'loading' || !apiKey}
                            >
                                {testStatus === 'loading' ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : testStatus === 'success' ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                ) : testStatus === 'error' ? (
                                    <XCircle className="h-3 w-3 text-red-500" />
                                ) : (
                                    <Activity className="h-3 w-3" />
                                )}
                                {testStatus === 'loading' ? 'Probando Conexión...' : 
                                 testStatus === 'success' ? '¡Lápiz Activo!' : 
                                 testStatus === 'error' ? 'Fallo en la Prueba' : 'Probar Lápiz (Diagnóstico)'}
                            </Button>
                            
                            {testStatus === 'error' && (
                                <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                                    <p className="text-[10px] text-red-500 font-medium leading-tight">
                                        <span className="font-bold block mb-1">FALLO DE CONEXIÓN:</span>
                                        {testError}
                                    </p>
                                    <p className="text-[10px] text-red-400 mt-2 italic">
                                        Tip: Revisa que la "Generative Language API" esté habilitada en Google Cloud Console.
                                    </p>
                                </div>
                            )}

                            {testStatus === 'success' && availableModels.length > 0 && (
                                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-green-500 uppercase">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="h-3 w-3" />
                                            Modelos Encontrados ({availableModels.length})
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-5 w-5 text-green-500/50 hover:text-green-500"
                                            onClick={() => {
                                                const list = availableModels.map(m => m.id).join(', ');
                                                navigator.clipboard.writeText(list);
                                                setSaveStatus('success');
                                                setTimeout(() => setSaveStatus('idle'), 1000);
                                            }}
                                            title="Copiar lista de modelos"
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <div className="max-h-[120px] overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                        {availableModels.slice(0, 8).map((m) => (
                                            <div key={m.id} className="p-2 rounded bg-green-500/5 border border-green-500/10 flex flex-col gap-0.5">
                                                <span className="text-[10px] font-mono font-bold text-foreground">{m.id}</span>
                                                <span className="text-[8px] text-muted-foreground truncate">{m.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[9px] text-muted-foreground italic">
                                        El sistema usará automáticamente el mejor modelo disponible de esta lista.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button 
                        onClick={handleSave} 
                        className={saveStatus === 'success' ? 'bg-green-600 hover:bg-green-600' : ''}
                    >
                        {saveStatus === 'success' ? '¡Guardado!' : 'Guardar Cambios'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
