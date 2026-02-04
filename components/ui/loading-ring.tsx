"use client"

import { motion } from "framer-motion"

export function LoadingRing() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="relative flex h-24 w-24 items-center justify-center">
                {/* Outer Ring */}
                <motion.div
                    className="absolute h-full w-full rounded-full border-4 border-primary/20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                />

                {/* Spinning Ring */}
                <motion.div
                    className="absolute h-full w-full rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                />

                {/* Inner Pulse */}
                <motion.div
                    className="h-3 w-3 rounded-full bg-secondary shadow-[0_0_10px_var(--color-secondary)]"
                    animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.5, 1, 0.5]
                    }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                />
            </div>
        </div>
    )
}
