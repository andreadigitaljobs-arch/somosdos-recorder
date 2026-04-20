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
        files: 0,
        folders: 0,
        transcriptions: 0,
        quizzes: 0
    })

    useEffect(() => {
        async function fetchCounts() {
            if (!currentSpace) return
            setLoading(true)

            try {
                // 1. Files & Folders
                const { count: filesCount } = await supabase
                    .from('files')
                    .select('*', { count: 'exact', head: true })
                    .eq('space_id', currentSpace.id)
                    .eq('type', 'file')

                const { count: foldersCount } = await supabase
                    .from('files')
                    .select('*', { count: 'exact', head: true })
                    .eq('space_id', currentSpace.id)
                    .eq('type', 'folder')

                // 2. Transcriptions
                const { count: transcriptionsCount } = await supabase
                    .from('transcriptions')
                    .select('*', { count: 'exact', head: true })
                    .eq('metadata->>space_id', currentSpace.id)

                setCounts({
                    files: filesCount || 0,
                    folders: foldersCount || 0,
                    transcriptions: transcriptionsCount || 0,
                    quizzes: 0 // Hidden
                })

                // 3. Recent Activity Feed (Filtered to Transcriptions ONLY)
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
                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

                setActivities(unifiedActivity)

            } catch (error) {
                console.error("Error fetching stats:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchCounts()
    }, [currentSpace, supabase])


    const stats = [
        { title: "Archivos", value: counts.files, icon: FileText, color: "text-blue-500" },
        { title: "Carpetas", value: counts.folders, icon: Folder, color: "text-yellow-500" },
        { title: "Transcripciones", value: counts.transcriptions, icon: Mic, color: "text-primary" },
    ]

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground/90 font-sans">Inicio</h2>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {stats.map((stat) => (
                    <Card key={stat.title} className="bg-card/40 border-primary/10 backdrop-blur-sm shadow-xl">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold text-foreground">
                                {loading ? (
                                    <div className="h-6 w-12 bg-primary/10 animate-pulse rounded-md" />
                                ) : (
                                    stat.value
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Dashboard Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <Card className="lg:col-span-2 border-border/50 bg-card/30 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Actividad Reciente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-12 w-full bg-accent/10 animate-pulse rounded-md" />
                                ))}
                            </div>
                        ) : activities.length === 0 ? (
                            <div className="h-[200px] w-full flex items-center justify-center bg-accent/20 rounded-lg border border-dashed border-border/60">
                                <div className="text-center text-muted-foreground">
                                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <span className="text-sm">Sin actividad reciente</span>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activities.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-accent/40 transition-colors group">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className={`p-2 rounded-full ${item.color}`}>
                                                <item.icon className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium leading-none truncate" title={item.title}>{item.title}</span>
                                                <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
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

                {/* Quick Actions */}
                <div className="grid grid-cols-1 gap-4">
                    <Card className="bg-gradient-to-br from-primary/20 to-secondary/20 border-primary/20 shadow-2xl">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Acceso Rápido</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <a href="/transcriptor" className="flex flex-col items-center justify-center p-6 bg-background/40 rounded-2xl border border-primary/10 hover:bg-background/60 transition-all hover:scale-[1.02] active:scale-95 group">
                                <div className="p-3 rounded-full bg-primary/20 mb-3 group-hover:scale-110 transition-transform">
                                    <Mic className="h-6 w-6 text-primary" />
                                </div>
                                <span className="text-sm font-semibold text-primary">Transcribir Grabación</span>
                                <span className="text-[10px] text-muted-foreground mt-1 text-center">Inicia una nueva grabación o sube un archivo</span>
                            </a>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
