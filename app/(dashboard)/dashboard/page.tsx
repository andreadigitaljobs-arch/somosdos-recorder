"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Folder, Mic, Brain, Activity, Clock } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useSpace } from "@/components/providers/space-provider"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

type ActivityItem = {
    id: string
    type: 'transcription' | 'quiz'
    title: string
    date: string
    icon: any
    color: string
}

export default function DashboardPage() {
    const supabase = createClient()
    const { currentSpace } = useSpace()

    const [loading, setLoading] = useState(true)
    const [activities, setActivities] = useState<ActivityItem[]>([])
    const [counts, setCounts] = useState({
        transcriptions: 0,
        files: 0
    })

    useEffect(() => {
        async function fetchStats() {
            if (!currentSpace) return
            setLoading(true)

            try {
                // 1. Files
                const { count: filesCount } = await supabase
                    .from('files')
                    .select('*', { count: 'exact', head: true })
                    .eq('space_id', currentSpace.id)

                // 2. Transcriptions
                const { count: transcriptionsCount } = await supabase
                    .from('transcriptions')
                    .select('*', { count: 'exact', head: true })
                    .eq('metadata->>space_id', currentSpace.id)

                setCounts({
                    files: filesCount || 0,
                    transcriptions: transcriptionsCount || 0
                })

                // 3. Recent Transcriptions Activity
                const { data: recentTranscriptions } = await supabase
                    .from('transcriptions')
                    .select('id, created_at, metadata')
                    .eq('metadata->>space_id', currentSpace.id)
                    .order('created_at', { ascending: false })
                    .limit(5)

                const unifiedActivity: ActivityItem[] = [
                    ...(recentTranscriptions || []).map(t => ({
                        id: t.id,
                        type: 'transcription' as const,
                        title: (t.metadata as any)?.filename || 'Audio Transcrito',
                        date: t.created_at,
                        icon: Mic,
                        color: "text-primary bg-primary/10"
                    }))
                ]

                setActivities(unifiedActivity)

            } catch (error) {
                console.error("Error fetching stats:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [currentSpace, supabase])

    return (
        <div className="space-y-8 pb-12">
            <header className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight text-foreground/90 font-sans">
                    Bienvenido a <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">SomosDos Recorder</span>
                </h2>
                <p className="text-muted-foreground text-sm">Tu centro de mando para capturas e inteligencia de audio.</p>
            </header>

            {/* Main Action Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                    {/* Live Recorder Component */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-widest text-primary/70">
                            <Circle className="h-3 w-3 fill-primary animate-pulse" />
                            Grabación en Directo
                        </div>
                        <LiveRecorder />
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <Card className="glass border-primary/20">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-2xl bg-primary/10">
                                        <Mic className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Transcripciones</p>
                                        <p className="text-2xl font-bold">{loading ? "..." : counts.transcriptions}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="glass border-secondary/20">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-2xl bg-secondary/10">
                                        <FileText className="h-6 w-6 text-secondary" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Archivos</p>
                                        <p className="text-2xl font-bold">{loading ? "..." : counts.files}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Right Column: Recent Activity & secondary actions */}
                <div className="space-y-6">
                    <Card className="border-border/50 bg-card/10 backdrop-blur-md">
                        <CardHeader className="pb-4 border-b border-border/30">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-muted-foreground" />
                                    Historial Reciente
                                </CardTitle>
                                <a href="/library" className="text-xs text-primary hover:underline font-medium">Ver Biblioteca</a>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {loading ? (
                                <div className="space-y-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-14 w-full bg-accent/5 animate-pulse rounded-2xl" />
                                    ))}
                                </div>
                            ) : activities.length === 0 ? (
                                <div className="h-[200px] w-full flex flex-col items-center justify-center bg-accent/5 rounded-2xl border border-dashed border-border/30 gap-3">
                                    <Activity className="h-8 w-8 text-muted-foreground/30" />
                                    <span className="text-sm text-muted-foreground">Aún no hay transcripciones</span>
                                    <Button variant="outline" size="sm" onClick={() => window.location.href = '/transcriptor'}>Empezar ahora</Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {activities.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl border border-border/20 bg-card/20 hover:bg-accent/10 transition-all group cursor-pointer" onClick={() => window.location.href = `/library?id=${item.id}`}>
                                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                                <div className={`p-2.5 rounded-xl ${item.color}`}>
                                                    <item.icon className="h-4 w-4" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{item.title}</span>
                                                    <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                                        {formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: es })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20 overflow-hidden relative group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Brain className="h-24 w-24" />
                        </div>
                        <CardContent className="p-6">
                            <h4 className="font-bold text-foreground mb-1">Análisis Pro</h4>
                            <p className="text-xs text-muted-foreground mb-4">Sube archivos existentes para un análisis profundo con IA.</p>
                            <Button className="w-full bg-background/50 hover:bg-background/80 text-foreground border-border/50" onClick={() => window.location.href = '/transcriptor'}>
                                Ir al Transcriptor
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
