"use client"

import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TopNav } from "./top-nav"
import { SettingsDialog } from "@/components/settings-dialog"

export function DashboardHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
    return (
        <header className="sticky top-0 z-40 w-full bg-background/40 backdrop-blur-md supports-[backdrop-filter]:bg-background/20">
            <div className="flex items-center justify-between px-6 py-4">
                {/* Left: Sidebar Trigger - Hidden on Mobile, handled by Bottom Dock */}
                <div className="flex items-center md:hidden">
                    {/* Trigger removed as per Smart Dock request */}
                </div>

                {/* Right: Settings */}
                <div className="flex items-center gap-2">
                    <div className="hidden md:block">
                        <SettingsDialog />
                    </div>
                    <div className="md:hidden">
                        {/* El acceso a ajustes en móvil ahora está en el Bottom Dock */}
                    </div>
                </div>
            </div>
        </header>
    )
}
