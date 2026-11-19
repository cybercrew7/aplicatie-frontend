import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static SPA build served by Nginx (see deploy/nginx.conf).
			// `fallback` emits build/index.html so client-side routes such as
			// /resources, /reservations and /admin survive a hard refresh.
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: 'index.html',
				precompress: false,
				strict: true
			})
		})
	],

	// Dev server: forward /api to the local ASP.NET Core backend so the browser
	// sees a same-origin request (no CORS). Production uses deploy/nginx.conf.
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:5255',
				changeOrigin: true,
				secure: false
			}
		}
	}
});
