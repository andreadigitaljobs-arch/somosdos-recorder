import { useState, useEffect } from "react"
import { Settings, Key, Eye, EyeOff } from "lucide-react"
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

    const handleSave = () => {
        if (apiKey.trim()) {
            localStorage.setItem("gemini_api_key", apiKey.trim())
            setOpen(false)
            // Optional: Notify success (using basic alert for now or just close)
            // alert("API Key guardada correctamente")
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
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave}>Guardar Cambios</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
