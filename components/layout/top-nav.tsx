"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Mic, FileText, LayoutGrid } from "lucide-react"
import { motion } from "framer-motion"
import { useState } from "react"
import { MobileMenu } from "./mobile-menu"

export function TopNav() {
    const pathname = usePathname()
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    const navItems = [
        { name: "Grabadora", href: "/transcriptor", icon: Mic },
        { name: "Biblioteca", href: "/library", icon: FileText },
        { name: "Mi Espacio", href: "#space", icon: LayoutGrid, action: () => setIsMenuOpen(true) },
    ]

    return (
        <>
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-sm">
                <nav className="flex items-center justify-around p-1.5 bg-[#0c122e]/90 backdrop-blur-3xl rounded-[28px] border border-primary/20 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative overflow-hidden">
                    {/* Inner Glow */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                    
                    {navItems.map((item) => {
                        const isActive = pathname === item.href
                        const Icon = item.icon
                        
                        const content = (
                            <div className={cn(
                                "relative flex flex-col items-center gap-1 px-4 py-2 rounded-2xl text-[10px] font-bold transition-all z-10 min-w-[80px]",
                                isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                            )}>
                                {/* Animated Background Pill */}
                                {isActive && (
                                    <motion.div
                                        layoutId="dock-active"
                                        className="absolute inset-0 bg-primary rounded-2xl shadow-[0_8px_20px_rgba(39,73,208,0.4)]"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                
                                <Icon className={cn("h-5 w-5 relative z-20", isActive ? "scale-110" : "opacity-70")} />
                                <span className="relative z-20 uppercase tracking-tighter">{item.name}</span>
                            </div>
                        )

                        if (item.action) {
                            return (
                                <button key={item.name} onClick={item.action} className="outline-none">
                                    {content}
                                </button>
                            )
                        }

                        return (
                            <Link key={item.href} href={item.href}>
                                {content}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <MobileMenu 
                isOpen={isMenuOpen} 
                onClose={() => setIsMenuOpen(false)} 
            />
        </>
    )
}
