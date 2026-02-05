"use client"

import { useCallback } from 'react'

export function useAudioFeedback() {
    const playSound = useCallback((type: 'success' | 'error' | 'start') => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'success') {
                // Happy "Ding!" (Winner sound)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.3, ctx.currentTime); // INCREASED VOLUME (0.1 -> 0.3)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.6);
            } else if (type === 'start') {
                // Short "Blip" (Process started)
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                gain.gain.setValueAtTime(0.2, ctx.currentTime); // INCREASED VOLUME (0.05 -> 0.2)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            } else {
                // Error "Buzz" (Something failed)
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(110, ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(55, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.4, ctx.currentTime); // INCREASED VOLUME (0.1 -> 0.4)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch (e) {
            console.error("Audio feedback failed:", e);
        }
    }, [])

    return { playSound }
}
