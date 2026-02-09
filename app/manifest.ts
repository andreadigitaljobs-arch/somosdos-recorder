import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'E-Education Platform',
        short_name: 'E-Education',
        description: 'Plataforma de estudio inteligente con IA',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#7c3aed', // Violet-600 (Primary brand color)
        icons: [
            {
                src: '/icon.jpg',
                sizes: '192x192',
                type: 'image/jpeg',
            },
            {
                src: '/icon.jpg',
                sizes: '512x512',
                type: 'image/jpeg',
            },
        ],
    }
}
