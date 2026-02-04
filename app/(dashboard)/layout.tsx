"use client"

import { useState } from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { DashboardHeader } from "@/components/layout/dashboard-header"
import { SpaceProvider } from "@/components/providers/space-provider"

import { TranscriptionProvider } from "@/components/providers/transcription-provider"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false)

    return (
        <SpaceProvider>
            <TranscriptionProvider>
                <div className="min-h-screen bg-background relative flex flex-col md:flex-row">
                    {/* Desktop Sidebar: Visible on MD+ */}
                    <div className="hidden md:block h-screen sticky top-0 w-[280px] border-r border-border bg-card shadow-xl z-20">
                        <Sidebar isOpen={true} onClose={() => { }} isDesktop={true} />
                    </div>

                    {/* Mobile Sidebar: Controlled by state */}
                    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                    <div className="flex-1 flex flex-col h-screen overflow-hidden">
                        <DashboardHeader onOpenSidebar={() => setSidebarOpen(true)} />
                        <main className="flex-1 container mx-auto px-10 py-4 pb-20 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto">
                            {children}
                        </main>
                    </div>
                </div>
            </TranscriptionProvider>
        </SpaceProvider>
    )
}
